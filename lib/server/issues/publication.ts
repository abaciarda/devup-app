import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import {
  issueContentSchema,
  type IssueContent,
} from "../../../types/issue-content";
import { editionDateKey } from "../../edition-date";
import { evidenceSchema, looksTurkish, modelSourceText } from "./draft-content";
import { inPublicationWindow } from "../operations/schedule";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
} from "../operations/lease";
import { constantTimeEqual, hashToken } from "../shared/security";
import { normalizeStoryUrl } from "../sources/text";
import { sourceKeySchema } from "../shared/validation";
import { nextEditionNumber } from "./edition-number";

export const publicationErrorSchema = z.enum([
  "issue_not_found",
  "issue_not_ready",
  "issue_locked",
  "review_changed",
  "invalid_content",
  "invalid_assignments",
  "source_disabled",
  "invalid_evidence",
  "future_edition",
  "automatic_window_closed",
  "automatic_edition_mismatch",
]);

export type PublicationErrorCode = z.infer<typeof publicationErrorSchema>;

export class PublicationError extends Error {
  constructor(public readonly code: PublicationErrorCode) {
    super(`Publication refused: ${code}`);
    this.name = "PublicationError";
  }
}

export const publicationApprovalSchema = z.strictObject({
  issueId: z.number().int().positive().max(2_147_483_647),
  reviewVersion: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedTr: z.literal(true),
  reviewedEn: z.literal(true),
});

export type PublicationApproval = z.infer<typeof publicationApprovalSchema>;

const evidenceMetadataSchema = z.object({
  version: z.literal(1),
  savedDraft: z.object({
    model: z.string().min(1).max(100),
    code: z.literal("ok"),
    evidence: evidenceSchema,
  }),
});

export function issueReviewVersion(
  content: IssueContent,
  updatedAt: Date,
): string {
  return hashToken(
    `${updatedAt.toISOString()}\n${JSON.stringify(issueContentSchema.parse(content))}`,
  );
}

export type PublicationResult =
  | { status: "busy" }
  | {
      status: "published" | "already_published";
      issueId: number;
      editionKey: string;
    };

async function publishValidatedDraft(
  tx: Prisma.TransactionClient,
  approval: { issueId: number; reviewVersion?: string; automatic: boolean },
  now: Date,
): Promise<Exclude<PublicationResult, { status: "busy" }>> {
  z.date().parse(now);
  if (approval.automatic && !inPublicationWindow(now))
    throw new PublicationError("automatic_window_closed");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('devup:edition-number', 0))`;
  const issue = await tx.issue.findUnique({
    where: { id: approval.issueId },
    include: { rawItems: { include: { source: true } } },
  });
  if (!issue) throw new PublicationError("issue_not_found");
  const key = issue.editionDate.toISOString().slice(0, 10);
  if (approval.automatic && key !== editionDateKey(now))
    throw new PublicationError("automatic_edition_mismatch");
  if (issue.publishedAt)
    return { status: "already_published", issueId: issue.id, editionKey: key };
  if (issue.deliveryStartedAt || issue.deliveryFinishedAt)
    throw new PublicationError("issue_locked");
  if (issue.generationStatus !== "ready")
    throw new PublicationError("issue_not_ready");
  if (key > editionDateKey(now)) throw new PublicationError("future_edition");
  const parsed = issueContentSchema.safeParse(issue.content);
  if (!parsed.success) throw new PublicationError("invalid_content");
  const content = parsed.data;
  if (
    approval.automatic &&
    (issue.generationError ||
      content.tr.title.length > 80 ||
      content.en.title.length > 80 ||
      content.tr.news.some(
        (story) => !looksTurkish(`${story.title} ${story.summary}`),
      ))
  )
    throw new PublicationError("invalid_content");
  if (
    approval.reviewVersion !== undefined &&
    !constantTimeEqual(
      approval.reviewVersion,
      issueReviewVersion(content, issue.updatedAt),
    )
  ) {
    throw new PublicationError("review_changed");
  }
  const selected = content.tr.news;
  const byId = new Map(issue.rawItems.map((row) => [row.id, row]));
  if (byId.size !== selected.length)
    throw new PublicationError("invalid_assignments");
  const metadata = evidenceMetadataSchema.safeParse(issue.generationUsage);
  if (
    !metadata.success ||
    metadata.data.savedDraft.model !== issue.generationModel ||
    metadata.data.savedDraft.evidence.length !== selected.length
  )
    throw new PublicationError("invalid_evidence");
  const normalized = new Set<string>();
  for (let index = 0; index < selected.length; index += 1) {
    const story = selected[index];
    const row = byId.get(story.rawItemId);
    if (
      !row ||
      row.usedIssueId !== issue.id ||
      !row.publishedAt ||
      row.source.key !== story.sourceKey ||
      row.originalUrl !== story.url
    )
      throw new PublicationError("invalid_assignments");
    if (!row.source.enabled) throw new PublicationError("source_disabled");
    let canonical: string;
    try {
      canonical = normalizeStoryUrl(row.originalUrl);
    } catch {
      throw new PublicationError("invalid_assignments");
    }
    if (canonical !== row.normalizedUrl || normalized.has(canonical))
      throw new PublicationError("invalid_assignments");
    normalized.add(canonical);
    const anchor = metadata.data.savedDraft.evidence[index];
    const candidate = {
      rawItemId: row.id,
      sourceKey: sourceKeySchema.parse(row.source.key),
      title: row.title,
      sourceText: row.excerpt,
      originalUrl: row.originalUrl,
      normalizedUrl: row.normalizedUrl,
      publishedAt: row.publishedAt,
      tags: row.tags,
      sourceRank: 0,
    };
    if (
      anchor.rawItemId !== story.rawItemId ||
      !modelSourceText(candidate).includes(anchor.quote)
    ) {
      throw new PublicationError("invalid_evidence");
    }
  }
  const reused = await tx.rawItem.count({
    where: {
      normalizedUrl: { in: [...normalized] },
      usedIssueId: { not: issue.id },
      NOT: { usedIssueId: null },
    },
  });
  if (reused !== 0) throw new PublicationError("invalid_assignments");
  const changed = await tx.issue.updateMany({
    where: {
      id: issue.id,
      generationStatus: "ready",
      publishedAt: null,
      updatedAt: issue.updatedAt,
      deliveryStartedAt: null,
      deliveryFinishedAt: null,
    },
    data: { publishedAt: now, editionNumber: await nextEditionNumber(tx) },
  });
  if (changed.count !== 1) throw new PublicationError("review_changed");
  return { status: "published", issueId: issue.id, editionKey: key };
}

export async function publishDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: PublicationApproval,
  now: Date = new Date(),
): Promise<Exclude<PublicationResult, { status: "busy" }>> {
  const approval = publicationApprovalSchema.parse(input);
  return publishValidatedDraft(tx, { ...approval, automatic: false }, now);
}

export async function publishAutomaticDraftInTransaction(
  tx: Prisma.TransactionClient,
  issueId: number,
  now: Date = new Date(),
): Promise<Exclude<PublicationResult, { status: "busy" }>> {
  z.number().int().positive().max(2_147_483_647).parse(issueId);
  return publishValidatedDraft(tx, { issueId, automatic: true }, now);
}

export async function publishReviewedIssue(
  input: PublicationApproval,
): Promise<PublicationResult> {
  const approval = publicationApprovalSchema.parse(input);
  const lease = await acquirePipelineLease();
  if (!lease) return { status: "busy" };
  try {
    return await commitUnderPipelineLease(lease, (tx) =>
      publishDraftInTransaction(tx, approval),
    );
  } finally {
    await releasePipelineLease(lease);
  }
}

export const sourceSwitchSchema = z.strictObject({
  sourceKey: sourceKeySchema,
  enabled: z.boolean(),
});
export type SourceSwitch = z.infer<typeof sourceSwitchSchema>;
export type SourceSwitchResult = {
  status: "busy" | "saved" | "source_not_found";
};

export async function setSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: SourceSwitch,
): Promise<SourceSwitchResult> {
  const change = sourceSwitchSchema.parse(input);
  const source = await tx.source.findUnique({
    where: { key: change.sourceKey },
  });
  if (!source) return { status: "source_not_found" };
  if (source.enabled !== change.enabled)
    await tx.source.update({
      where: { id: source.id },
      data: { enabled: change.enabled },
    });
  return { status: "saved" };
}

export async function setSourceEnabled(
  input: SourceSwitch,
): Promise<SourceSwitchResult> {
  const change = sourceSwitchSchema.parse(input);
  const lease = await acquirePipelineLease();
  if (!lease) return { status: "busy" };
  try {
    return await commitUnderPipelineLease(lease, (tx) =>
      setSourceInTransaction(tx, change),
    );
  } finally {
    await releasePipelineLease(lease);
  }
}
