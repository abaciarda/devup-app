import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { issueContentSchema } from "../../../types/issue-content";
import { prepareCandidates, sourceKeys, type Candidate } from "../sources/candidates";
import { getDb } from "../database/client";
import {
  evidenceSchema,
  modelSourceText,
  type ValidatedDraft,
} from "./draft-content";
import {
  attemptSchema,
  GenerationFailure,
  type GenerationAttempt,
  type GenerationRun,
} from "./gemini";

const runRecordSchema = z.strictObject({
  at: z.iso.datetime(),
  model: z.string().max(100).nullable(),
  code: z.string().max(100),
  attempts: z.array(attemptSchema).max(3),
  evidence: evidenceSchema.or(z.array(z.never()).length(0)),
});

const metadataSchema = z.strictObject({
  version: z.literal(1),
  savedDraft: runRecordSchema.nullable(),
  lastRun: runRecordSchema,
});

type DraftClient = Pick<Prisma.TransactionClient, "rawItem">;

export async function loadDraftCandidates(
  issueId: number,
  now: Date,
  client: DraftClient = getDb(),
): Promise<Candidate[]> {
  const rows = (
    await Promise.all(
      sourceKeys.map((key) =>
        client.rawItem.findMany({
          where: {
            OR: [{ usedIssueId: null }, { usedIssueId: issueId }],
            source: { key, enabled: true },
            publishedAt: {
              gte: new Date(now.getTime() - 72 * 60 * 60 * 1000),
              lte: new Date(now.getTime() + 300_000),
            },
            fetchedAt: {
              gte: new Date(now.getTime() - 90 * 60 * 1000),
              lte: new Date(now.getTime() + 300_000),
            },
            excerpt: { not: "" },
          },
          include: { source: true },
          orderBy: [{ score: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
          take: 60,
        }),
      ),
    )
  ).flat();
  const otherUsed = await client.rawItem.findMany({
    where: {
      normalizedUrl: { in: rows.map((row) => row.normalizedUrl) },
      usedIssueId: { not: issueId },
      NOT: { usedIssueId: null },
    },
    select: { normalizedUrl: true },
  });
  return prepareCandidates(
    rows.map((row) => ({ ...row, usedIssueId: null })),
    new Set(otherUsed.map((row) => row.normalizedUrl)),
    now,
  ).slice(0, 12);
}

export async function requirePrivateIssue(
  tx: Prisma.TransactionClient,
  issueId: number,
) {
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: issueId } });
  if (
    issue.publishedAt ||
    issue.deliveryStartedAt ||
    issue.deliveryFinishedAt
  ) {
    throw new GenerationFailure("issue_locked");
  }
  return issue;
}

function validateStoredDraft(
  draft: ValidatedDraft,
  pool: Candidate[],
): ValidatedDraft {
  const content = issueContentSchema.parse(draft.content);
  const evidence = evidenceSchema.parse(draft.evidence);
  if (evidence.length !== content.tr.news.length)
    throw new GenerationFailure("candidate_conflict");
  const byId = new Map(
    pool.map((candidate) => [candidate.rawItemId, candidate]),
  );
  content.tr.news.forEach((story, index) => {
    const candidate = byId.get(story.rawItemId);
    const anchor = evidence[index];
    if (
      !candidate ||
      story.sourceKey !== candidate.sourceKey ||
      story.url !== candidate.originalUrl ||
      !anchor ||
      anchor.rawItemId !== story.rawItemId ||
      !modelSourceText(candidate).includes(anchor.quote)
    ) {
      throw new GenerationFailure("candidate_conflict");
    }
  });
  return { content, evidence };
}

export async function saveReadyDraft(
  tx: Prisma.TransactionClient,
  issueId: number,
  run: GenerationRun,
  originalPool: Candidate[],
  now: Date,
): Promise<void> {
  await requirePrivateIssue(tx, issueId);
  if (!run.draft)
    throw new GenerationFailure("insufficient_supported_content", run.attempts);
  const current = await loadDraftCandidates(issueId, now, tx);
  const originals = new Map(
    originalPool.map((candidate) => [candidate.rawItemId, candidate]),
  );
  const unchanged = current.filter((candidate) => {
    const previous = originals.get(candidate.rawItemId);
    return (
      previous &&
      previous.title === candidate.title &&
      previous.sourceText === candidate.sourceText &&
      previous.sourceKey === candidate.sourceKey &&
      previous.originalUrl === candidate.originalUrl &&
      previous.normalizedUrl === candidate.normalizedUrl &&
      previous.publishedAt.getTime() === candidate.publishedAt.getTime()
    );
  });
  const draft = validateStoredDraft(run.draft, unchanged);
  const ids = draft.content.tr.news.map((story) => story.rawItemId);
  const claimed = await tx.rawItem.updateMany({
    where: {
      id: { in: ids },
      OR: [{ usedIssueId: null }, { usedIssueId: issueId }],
    },
    data: { usedIssueId: issueId },
  });
  if (claimed.count !== ids.length)
    throw new GenerationFailure("candidate_conflict", run.attempts);
  await tx.rawItem.updateMany({
    where: { usedIssueId: issueId, id: { notIn: ids } },
    data: { usedIssueId: null },
  });
  const record = runRecordSchema.parse({
    at: now.toISOString(),
    model: run.model,
    code: "ok",
    attempts: run.attempts,
    evidence: draft.evidence,
  });
  const updated = await tx.issue.updateMany({
    where: {
      id: issueId,
      publishedAt: null,
      deliveryStartedAt: null,
      deliveryFinishedAt: null,
    },
    data: {
      generationStatus: "ready",
      content: draft.content,
      generationModel: run.model,
      generationUsage: { version: 1, savedDraft: record, lastRun: record },
      generationError: null,
    },
  });
  if (updated.count !== 1)
    throw new GenerationFailure("issue_locked", run.attempts);
}

export async function recordGenerationFailure(
  tx: Prisma.TransactionClient,
  issueId: number,
  code: string,
  attempts: GenerationAttempt[],
  now: Date,
): Promise<boolean> {
  const issue = await requirePrivateIssue(tx, issueId);
  const keptPreviousDraft = issue.generationStatus === "ready";
  let savedDraft: z.infer<typeof runRecordSchema> | null = null;
  if (keptPreviousDraft) {
    issueContentSchema.parse(issue.content);
    savedDraft = metadataSchema.parse(issue.generationUsage).savedDraft;
    if (!savedDraft) throw new GenerationFailure("invalid_saved_metadata");
  }
  const lastRun = runRecordSchema.parse({
    at: now.toISOString(),
    model: attempts.at(-1)?.model ?? null,
    code,
    attempts,
    evidence: [],
  });
  const updated = await tx.issue.updateMany({
    where: {
      id: issueId,
      publishedAt: null,
      deliveryStartedAt: null,
      deliveryFinishedAt: null,
    },
    data: {
      generationStatus: keptPreviousDraft ? "ready" : "failed",
      generationError: code,
      generationUsage: { version: 1, savedDraft, lastRun },
    },
  });
  if (updated.count !== 1)
    throw new GenerationFailure("issue_locked", attempts);
  return keptPreviousDraft;
}
