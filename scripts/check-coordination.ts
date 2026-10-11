import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/server/db";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  PipelineLeaseLostError,
  releasePipelineLease,
  renewPipelineLease,
  type PipelineLease,
} from "../lib/server/pipeline-lease";
import { consumeRateLimit } from "../lib/server/rate-limit";

const db = getDb();
const key = `verify:${randomUUID()}`;
let owned: PipelineLease | null = null;

async function main(): Promise<void> {
  try {
    const options = { key, limit: 3, windowSeconds: 60 };
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => consumeRateLimit(options)),
    );

    assert.equal(attempts.filter((attempt) => attempt.allowed).length, 3);
    assert.equal(
      attempts.every((attempt) => attempt.hits <= 4),
      true,
    );
    assert.equal(
      attempts.some((attempt) => attempt.retryAfterSeconds > 0),
      true,
    );

    await db.rateLimit.update({
      where: { key },
      data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
    });

    const reset = await consumeRateLimit(options);
    assert.equal(reset.allowed, true);
    assert.equal(reset.hits, 1);

    const acquisitions = await Promise.all([
      acquirePipelineLease(60),
      acquirePipelineLease(60),
    ]);
    owned = acquisitions.find((lease) => lease !== null) ?? null;

    assert.equal(
      acquisitions.filter((lease) => lease !== null).length,
      1,
      "Stop other pipeline writers; the verification must acquire the lease",
    );
    assert.ok(owned);

    const first = owned;
    const renewed = await renewPipelineLease(first, 60);
    assert.ok(renewed);
    owned = renewed;

    const sources = await commitUnderPipelineLease(first, (tx) =>
      tx.source.count(),
    );
    assert.ok(sources >= 3);

    const wrongOwner: PipelineLease = { ...first, ownerToken: randomUUID() };
    assert.equal(await releasePipelineLease(wrongOwner), false);
    await assert.rejects(
      () => commitUnderPipelineLease(wrongOwner, (tx) => tx.source.count()),
      PipelineLeaseLostError,
    );

    await db.$executeRaw`
      UPDATE "PipelineLease"
      SET "expiresAt" = clock_timestamp() - interval '1 second'
      WHERE "key" = 'pipeline' AND "ownerToken" = ${first.ownerToken}
    `;

    const replacement = await acquirePipelineLease(60);
    assert.ok(replacement);
    owned = replacement;

    assert.notEqual(replacement.ownerToken, first.ownerToken);
    assert.equal(await renewPipelineLease(first, 60), null);
    assert.equal(await releasePipelineLease(first), false);
    await assert.rejects(
      () => commitUnderPipelineLease(first, (tx) => tx.source.count()),
      PipelineLeaseLostError,
    );

    assert.equal(await releasePipelineLease(replacement), true);
    owned = null;
    console.log(
      "Coordination checks passed: concurrent limits, lease ownership, and expiry recovery.",
    );
  } finally {
    if (owned) await releasePipelineLease(owned);
    await db.rateLimit.deleteMany({ where: { key } });
  }
}

main()
  .catch(() => {
    console.error(
      "Coordination check failed. Verify schema push/client generation and stop other pipeline writers; credentials are not printed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
