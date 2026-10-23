import assert from "node:assert/strict";
import {
  generationRetryDelayMs,
  scheduledGenerationLimit,
  scheduledGenerationState,
} from "../lib/server/operations/generation-retry";
import { reserveScheduledGeneration } from "../lib/server/operations/pipeline";

const start = new Date("2026-10-23T03:30:00Z");
const after = (ms: number) => new Date(start.getTime() + ms);
const issue = {
  generationStatus: "failed" as const,
  generationError: "novelty_review_failed" as string | null,
  scheduledGenerationAttempts: 1,
  updatedAt: start,
  publishedAt: null as Date | null,
  deliveryStartedAt: null as Date | null,
  deliveryFinishedAt: null as Date | null,
};
assert.equal(scheduledGenerationLimit, 3);
assert.equal(scheduledGenerationState(issue, start), "retry_scheduled");
assert.equal(
  scheduledGenerationState(issue, after(generationRetryDelayMs - 1)),
  "retry_scheduled",
);
assert.equal(
  scheduledGenerationState(issue, after(generationRetryDelayMs)),
  "attempt",
);
assert.equal(
  scheduledGenerationState({ ...issue, scheduledGenerationAttempts: 0 }, start),
  "attempt",
);
for (const generationError of [
  "novelty_response_invalid_schema",
  "novelty_response_invalid_candidate_ids",
  "scheduled_insufficient_candidates",
  "insufficient_novel_candidates",
  "http_429",
  "http_503",
  "request_timeout",
  null,
])
  assert.equal(
    scheduledGenerationState(
      { ...issue, generationError },
      after(generationRetryDelayMs),
    ),
    "attempt",
  );
for (const generationError of [
  "novelty_history_invalid",
  "novelty_input_too_large",
  "http_401",
  "http_403",
  "blocked",
  "unknown_error",
])
  assert.equal(
    scheduledGenerationState(
      { ...issue, generationError },
      after(generationRetryDelayMs),
    ),
    "needs_review",
  );
for (const locked of [
  { publishedAt: start },
  { deliveryStartedAt: start },
  { deliveryFinishedAt: start },
  { generationStatus: "ready" as const },
  { scheduledGenerationAttempts: 3 },
  { scheduledGenerationAttempts: 4 },
])
  assert.equal(
    scheduledGenerationState({ ...issue, ...locked }, after(86_400_000)),
    "needs_review",
  );
assert.equal(
  scheduledGenerationState(issue, after(-60_000)),
  "retry_scheduled",
);
assert.equal(
  scheduledGenerationState(issue, new Date("invalid")),
  "needs_review",
);

let stored = { ...issue, id: 7 };
const client = {
  issue: {
    findUnique: async () => ({ ...stored }),
    updateMany: async ({
      where,
      data,
    }: {
      where: typeof stored;
      data: {
        scheduledGenerationAttempts: { increment: number };
        updatedAt: Date;
      };
    }) => {
      if (
        where.scheduledGenerationAttempts !==
          stored.scheduledGenerationAttempts ||
        where.updatedAt.getTime() !== stored.updatedAt.getTime()
      )
        return { count: 0 };
      stored = {
        ...stored,
        scheduledGenerationAttempts:
          stored.scheduledGenerationAttempts +
          data.scheduledGenerationAttempts.increment,
        updatedAt: data.updatedAt,
      };
      return { count: 1 };
    },
  },
} as unknown as Parameters<typeof reserveScheduledGeneration>[0];
const due = after(generationRetryDelayMs);
const reservations = await Promise.all([
  reserveScheduledGeneration(client, stored.id, due),
  reserveScheduledGeneration(client, stored.id, due),
]);
assert.equal(reservations.filter(Boolean).length, 1);
assert.equal(stored.scheduledGenerationAttempts, 2);
assert.equal(await reserveScheduledGeneration(client, stored.id, due), false);
assert.equal(
  await reserveScheduledGeneration(
    client,
    stored.id,
    after(2 * generationRetryDelayMs),
  ),
  true,
);
assert.equal(stored.scheduledGenerationAttempts, 3);
assert.equal(
  await reserveScheduledGeneration(
    client,
    stored.id,
    after(3 * generationRetryDelayMs),
  ),
  false,
);
console.log(
  "Generation retry cooldown, cap, error classification, locked editions and competing reservations passed",
);
