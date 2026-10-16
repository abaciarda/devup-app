import assert from "node:assert/strict";
import { editionDateKey } from "../lib/edition-date";
import {
  morningStatus,
  type MorningCounts,
} from "../lib/server/operations/morning-status";

const empty: MorningCounts = {
  recipients: 0,
  accepted: 0,
  delivered: 0,
  pending: 0,
  failed: 0,
  unknown: 0,
  suppressed: 0,
  needsReview: 0,
};
const before = new Date("2026-10-17T04:14:59Z");
const after = new Date("2026-10-17T04:15:00Z");
const draft = {
  generationStatus: "ready",
  generationError: null,
  publishedAt: null,
  deliveryStartedAt: null,
  deliveryFinishedAt: null,
};
assert.equal(morningStatus(null, empty, before).tone, "blue");
assert.equal(
  morningStatus(null, empty, after).label,
  "Morning send has not started",
);
assert.equal(morningStatus(draft, empty, before).label, "Draft ready");
assert.equal(
  morningStatus({ ...draft, publishedAt: before }, empty, before).label,
  "Published, awaiting email send",
);
assert.equal(
  morningStatus({ ...draft, publishedAt: before }, empty, after).tone,
  "warning",
);
assert.equal(
  morningStatus(
    { ...draft, generationError: "generation_failed" },
    empty,
    before,
  ).label,
  "Draft needs review",
);
const finished = {
  ...draft,
  publishedAt: before,
  deliveryStartedAt: before,
  deliveryFinishedAt: before,
};
assert.equal(
  morningStatus(finished, empty, after).label,
  "No recipients captured",
);
assert.equal(
  morningStatus(finished, { ...empty, recipients: 2, accepted: 2 }, after)
    .label,
  "Accepted by email provider",
);
assert.equal(
  morningStatus(
    finished,
    { ...empty, recipients: 2, accepted: 1, failed: 1 },
    after,
  ).tone,
  "warning",
);
assert.equal(
  morningStatus(finished, { ...empty, recipients: 1, unknown: 1 }, after).label,
  "Delivery needs attention",
);
assert.equal(
  morningStatus(
    finished,
    { ...empty, recipients: 1, accepted: 1, needsReview: 1 },
    after,
  ).tone,
  "warning",
);
assert.equal(
  morningStatus(finished, { ...empty, recipients: 1, pending: 1 }, after).label,
  "Check delivery records",
);
assert.equal(
  morningStatus(
    { ...finished, deliveryFinishedAt: null },
    { ...empty, recipients: 1, pending: 1 },
    after,
  ).label,
  "Morning delivery is late",
);
assert.equal(editionDateKey(new Date("2026-10-16T21:00:00Z")), "2026-10-17");
assert.equal(
  morningStatus(null, empty, new Date("2026-10-16T21:00:00Z")).label,
  "Scheduled for this morning",
);
console.log(
  "Istanbul grace boundary, midnight rollover, published-versus-sent, zero recipients, failed/uncertain review, and accepted-versus-delivered status checks passed",
);
