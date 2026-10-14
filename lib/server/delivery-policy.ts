import "server-only";
import type { ProviderOutcome } from "./resend-provider";

export const retryWindowMs = 23 * 3600_000;
export const maxDeliveryAttempts = 6;
export function deliveryDecision(
  outcome: ProviderOutcome,
  attempts: number,
  firstAttemptAt: Date,
  uncertainBefore: boolean,
  now = new Date(),
) {
  if (outcome.kind === "accepted")
    return {
      status: "accepted" as const,
      retryable: false,
      needsReview: false,
      nextAttemptAt: null,
      providerId: outcome.providerId,
      acceptedAt: now,
      error: null,
    };
  const unknown = outcome.kind === "unknown" || uncertainBefore;
  const delay = Math.max(
    outcome.retryAfter,
    Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1)),
  );
  const next = new Date(now.getTime() + delay * 1000);
  const retryable =
    outcome.retryable &&
    attempts < maxDeliveryAttempts &&
    next.getTime() < firstAttemptAt.getTime() + retryWindowMs;
  return {
    status: unknown ? ("unknown" as const) : ("failed" as const),
    retryable,
    needsReview: unknown && !retryable,
    nextAttemptAt: retryable ? next : null,
    error: outcome.code,
  };
}
