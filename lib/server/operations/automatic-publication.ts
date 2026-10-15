import "server-only";
import { editionDateForNow } from "../../edition-date";
import { getDb } from "../database/client";
import { deliveryEnv } from "../delivery/env";
import { refreshPublishedIssueCache } from "../issues/cache";
import {
  PublicationError,
  publishAutomaticDraftInTransaction,
} from "../issues/publication";
import { operationsEnv } from "./env";
import { commitUnderPipelineLease, type PipelineLease } from "./lease";
import { inPublicationWindow } from "./schedule";

export async function publishMorningEdition(
  lease: PipelineLease,
  now: Date,
  refreshCache = refreshPublishedIssueCache,
) {
  const env = operationsEnv();
  if (env.AUTO_PUBLISH_ENABLED !== "true" || !inPublicationWindow(now))
    return null;
  if (
    env.PUBLIC_LAUNCH_APPROVED !== "true" ||
    deliveryEnv().EMAIL_DELIVERY_ENABLED !== "true"
  )
    return { state: "needs_review", reason: "automatic_delivery_not_enabled" };
  const issue = await getDb().issue.findUnique({
    where: { editionDate: editionDateForNow(now) },
    select: { id: true, deliveryFinishedAt: true },
  });
  if (!issue) return { state: "needs_review", reason: "missing_morning_draft" };
  if (issue.deliveryFinishedAt) return null;
  try {
    const result = await commitUnderPipelineLease(lease, (tx) =>
      publishAutomaticDraftInTransaction(tx, issue.id, now),
    );
    try {
      refreshCache(result.editionKey);
    } catch {
      return { state: "cache_refresh_pending", issueId: issue.id };
    }
    return null;
  } catch (error) {
    if (!(error instanceof PublicationError)) throw error;
    await commitUnderPipelineLease(lease, (tx) =>
      tx.issue.updateMany({
        where: { id: issue.id, publishedAt: null, generationError: null },
        data: { generationError: `automatic_publication_${error.code}` },
      }),
    );
    return { state: "needs_review", reason: error.code, issueId: issue.id };
  }
}
