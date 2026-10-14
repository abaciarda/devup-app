import "server-only";
import { editionDateFromKey, editionDateKey } from "../../edition-date";
import {
  loadDraftCandidates,
  loadRecentStoryTitles,
  recordGenerationFailure,
  requirePrivateIssue,
  saveReadyDraft,
} from "./draft-storage";
import { generateBilingualDraft, GenerationFailure } from "./gemini";
import { minimumEditionStories } from "../sources/candidates";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  PipelineLeaseLostError,
  releasePipelineLease,
  type PipelineLease,
} from "../operations/lease";

export type GenerateIssueResult =
  | { status: "busy" }
  | { status: "locked"; issueId: number }
  | { status: "ready"; issueId: number; storyCount: number }
  | {
      status: "failed";
      issueId: number;
      code: string;
      keptPreviousDraft: boolean;
    };

export async function generateIssue(
  options: {
    now?: () => Date;
    generator?: typeof generateBilingualDraft;
    lease?: PipelineLease;
  } = {},
): Promise<GenerateIssueResult> {
  const now = options.now ?? (() => new Date());
  const start = now();
  const key = editionDateKey(start);
  const date = editionDateFromKey(key);
  const lease = options.lease ?? (await acquirePipelineLease());
  if (!lease) return { status: "busy" };
  try {
    const issue = await commitUnderPipelineLease(lease, (tx) =>
      tx.issue.upsert({
        where: { editionDate: date },
        create: { editionDate: date },
        update: {},
      }),
    );
    if (
      issue.publishedAt ||
      issue.deliveryStartedAt ||
      issue.deliveryFinishedAt
    ) {
      return { status: "locked", issueId: issue.id };
    }
    try {
      const pool = await loadDraftCandidates(issue.id, start);
      if (pool.length < minimumEditionStories)
        throw new GenerationFailure("insufficient_candidates");
      const recentTitles = await loadRecentStoryTitles(issue.id, date);
      const run = await (options.generator ?? generateBilingualDraft)(
        pool,
        key,
        { recentTitles },
      );
      if (!run.draft)
        throw new GenerationFailure(
          "insufficient_supported_content",
          run.attempts,
        );
      const finished = now();
      if (editionDateKey(finished) !== key)
        throw new GenerationFailure("edition_day_changed", run.attempts);
      await commitUnderPipelineLease(lease, (tx) =>
        saveReadyDraft(tx, issue.id, run, pool, finished),
      );
      return {
        status: "ready",
        issueId: issue.id,
        storyCount: run.draft.content.tr.news.length,
      };
    } catch (error) {
      if (error instanceof PipelineLeaseLostError) throw error;
      const failure =
        error instanceof GenerationFailure
          ? error
          : new GenerationFailure("generation_or_storage_error");
      if (failure.code === "issue_locked")
        return { status: "locked", issueId: issue.id };
      const keptPreviousDraft = await commitUnderPipelineLease(
        lease,
        async (tx) => {
          await requirePrivateIssue(tx, issue.id);
          return recordGenerationFailure(
            tx,
            issue.id,
            failure.code,
            failure.attempts,
            now(),
          );
        },
      );
      return {
        status: "failed",
        issueId: issue.id,
        code: failure.code,
        keptPreviousDraft,
      };
    }
  } finally {
    if (!options.lease) await releasePipelineLease(lease);
  }
}
