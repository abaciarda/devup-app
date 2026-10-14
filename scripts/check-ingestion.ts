import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadCandidatePool } from "../lib/server/sources/candidates";
import { getDb } from "../lib/server/database/client";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
} from "../lib/server/operations/lease";
import { persistSourceBatch } from "../lib/server/sources/refresh";
import { rawItemInputSchema } from "../lib/server/shared/validation";

const db = getDb();
const rollback = new Error("Rollback Task 04 verification");

async function main(): Promise<void> {
  const lease = await acquirePipelineLease();
  assert.ok(lease, "Stop other pipeline writers before checking ingestion");
  try {
    const before = await db.$transaction([
      db.rawItem.count(),
      db.issue.count(),
    ]);
    let verified = false;
    try {
      await commitUnderPipelineLease(lease, async (tx) => {
        const now = new Date("2099-03-01T12:00:00.000Z");
        const externalId = `verify:${randomUUID()}`;
        const text =
          "This synthetic release explains the platform changes and their documented effects on existing applications. ".repeat(
            8,
          );
        const item = rawItemInputSchema.parse({
          sourceKey: "hackernews",
          externalId,
          title: "Example software release",
          originalUrl: "https://example.com/task-04/release?utm_source=hn",
          excerpt: text,
          publishedAt: now,
          score: 100,
        });
        const batch = { items: [item], retiredExternalIds: [] };
        assert.equal(
          (await persistSourceBatch(tx, "hackernews", batch, now)).inserted,
          1,
        );
        assert.equal(
          (await persistSourceBatch(tx, "hackernews", batch, now)).updated,
          1,
        );

        const source = await tx.source.findUniqueOrThrow({
          where: { key: "hackernews" },
        });
        const stored = await tx.rawItem.findUniqueOrThrow({
          where: { sourceId_externalId: { sourceId: source.id, externalId } },
        });
        assert.equal(stored.originalUrl, item.originalUrl);
        assert.equal(
          stored.normalizedUrl,
          "https://example.com/task-04/release",
        );

        const duplicate = rawItemInputSchema.parse({
          ...item,
          sourceKey: "devto",
        });
        await persistSourceBatch(
          tx,
          "devto",
          { items: [duplicate], retiredExternalIds: [] },
          now,
        );
        const pool = await loadCandidatePool(now, tx);
        assert.equal(
          pool.filter(
            (candidate) => candidate.normalizedUrl === stored.normalizedUrl,
          ).length,
          1,
        );

        const editionDate = new Date("2099-03-01T00:00:00.000Z");
        assert.equal(
          await tx.issue.findUnique({ where: { editionDate } }),
          null,
        );
        const issue = await tx.issue.create({ data: { editionDate } });
        await tx.rawItem.update({
          where: { id: stored.id },
          data: { usedIssueId: issue.id },
        });

        const changed = {
          ...item,
          title: "Do not replace assigned source text",
        };
        assert.equal(
          (
            await persistSourceBatch(
              tx,
              "hackernews",
              { items: [changed], retiredExternalIds: [] },
              now,
            )
          ).preserved,
          1,
        );
        assert.equal(
          (await tx.rawItem.findUniqueOrThrow({ where: { id: stored.id } }))
            .title,
          item.title,
        );
        assert.equal(
          (await loadCandidatePool(now, tx)).some(
            (candidate) => candidate.normalizedUrl === stored.normalizedUrl,
          ),
          false,
        );

        assert.equal(
          (
            await persistSourceBatch(
              tx,
              "hackernews",
              { items: [], retiredExternalIds: [externalId] },
              now,
            )
          ).removed,
          0,
        );
        assert.equal(
          (
            await persistSourceBatch(
              tx,
              "devto",
              { items: [], retiredExternalIds: [externalId] },
              now,
            )
          ).removed,
          1,
        );

        await tx.source.update({
          where: { id: source.id },
          data: { enabled: false },
        });
        const disabled = await persistSourceBatch(
          tx,
          "hackernews",
          {
            items: [{ ...item, externalId: `${externalId}:disabled` }],
            retiredExternalIds: [],
          },
          now,
        );
        assert.equal(disabled.disabled, true);
        assert.equal(disabled.inserted, 0);
        verified = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    assert.equal(verified, true);
    const after = await db.$transaction([db.rawItem.count(), db.issue.count()]);
    assert.deepEqual(after, before);
    console.log(
      "Ingestion checks passed. Test rows and source changes were rolled back.",
    );
  } finally {
    await releasePipelineLease(lease);
  }
}

main()
  .catch(() => {
    console.error(
      "Ingestion check failed. Check Task 03, source settings, and the unused verification date; credentials are not printed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
