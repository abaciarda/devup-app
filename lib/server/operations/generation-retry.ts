import type { Issue } from "@/generated/prisma/client";

export const scheduledGenerationLimit = 3;
export const generationRetryDelayMs = 10 * 60_000;

const retryableErrors = new Set([
  "novelty_review_failed",
  "novelty_response_invalid",
  "novelty_response_invalid_schema",
  "novelty_response_invalid_candidate_ids",
  "scheduled_insufficient_candidates",
  "insufficient_candidates",
  "insufficient_novel_candidates",
  "insufficient_supported_content",
  "request_timeout",
  "deadline",
  "network_error",
  "invalid_response",
  "invalid_draft_json",
  "invalid_draft_schema",
  "invalid_draft_content",
  "truncated",
  "http_429",
  "http_500",
  "http_502",
  "http_503",
  "http_504",
]);

type RetryIssue = Pick<
  Issue,
  | "generationStatus"
  | "generationError"
  | "scheduledGenerationAttempts"
  | "updatedAt"
  | "publishedAt"
  | "deliveryStartedAt"
  | "deliveryFinishedAt"
>;

export function scheduledGenerationState(
  issue: RetryIssue,
  now: Date,
): "attempt" | "retry_scheduled" | "needs_review" {
  if (
    issue.publishedAt ||
    issue.deliveryStartedAt ||
    issue.deliveryFinishedAt ||
    issue.generationStatus === "ready" ||
    issue.scheduledGenerationAttempts >= scheduledGenerationLimit
  )
    return "needs_review";
  if (issue.scheduledGenerationAttempts === 0) return "attempt";
  if (
    issue.generationError !== null &&
    !retryableErrors.has(issue.generationError)
  )
    return "needs_review";
  const elapsed = now.getTime() - issue.updatedAt.getTime();
  if (!Number.isFinite(elapsed)) return "needs_review";
  return elapsed >= generationRetryDelayMs ? "attempt" : "retry_scheduled";
}
