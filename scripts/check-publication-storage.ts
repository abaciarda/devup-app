import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/server/database/client";
import { validateModelDraft } from "../lib/server/issues/draft-content";
import { saveReadyDraft } from "../lib/server/issues/draft-storage";
import {
  acquirePipelineLease,
  releasePipelineLease,
  renewPipelineLease,
} from "../lib/server/operations/lease";
import {
  issueReviewVersion,
  PublicationError,
  publishDraftInTransaction,
  setSourceInTransaction,
} from "../lib/server/issues/publication";
import { draftFixture } from "./draft-fixture";
import { nextEditionNumber } from "../lib/server/issues/edition-number";

class RollbackCheck extends Error {}

async function main() {
  const db = getDb();
  let lease: Awaited<ReturnType<typeof acquirePipelineLease>> = null;
  try {
    lease = await acquirePipelineLease();
    assert.ok(lease, "Stop other pipeline operations before this check");
    const before = {
      issues: await db.issue.count(),
      items: await db.rawItem.count(),
      nextNumber: await nextEditionNumber(db),
    };
    const owner = lease;
    try {
      await db.$transaction(
        async (tx) => {
          assert.ok(await renewPipelineLease(owner, 600, tx));
          const now = new Date("2099-06-01T09:00:00.000Z");
          const source = await tx.source.findUniqueOrThrow({
            where: { key: "hackernews" },
          });
          assert.ok(
            source.enabled,
            "Enable hackernews before running this check",
          );
          const issue = await tx.issue.create({
            data: { editionDate: new Date("2099-06-01T00:00:00.000Z") },
          });
          const base = draftFixture(now);
          const ids: number[] = [];
          for (const candidate of base.pool) {
            const row = await tx.rawItem.create({
              data: {
                sourceId: source.id,
                externalId: `publish-check-${randomUUID()}`,
                title: candidate.title,
                originalUrl: candidate.originalUrl,
                normalizedUrl: candidate.normalizedUrl,
                excerpt: candidate.sourceText,
                publishedAt: now,
                fetchedAt: now,
                tags: candidate.tags,
              },
            });
            ids.push(row.id);
          }
          const fixture = draftFixture(now, ids);
          for (const candidate of fixture.pool)
            await tx.rawItem.update({
              where: { id: candidate.rawItemId },
              data: {
                originalUrl: candidate.originalUrl,
                normalizedUrl: candidate.normalizedUrl,
              },
            });
          await saveReadyDraft(
            tx,
            issue.id,
            {
              draft: validateModelDraft(fixture.output, fixture.pool),
              model: "fixture-model",
              attempts: [],
            },
            fixture.pool,
            now,
          );
          const saved = await tx.issue.findUniqueOrThrow({
            where: { id: issue.id },
          });
          const draft = validateModelDraft(fixture.output, fixture.pool);
          assert.ok(draft);
          const approval = {
            issueId: issue.id,
            reviewVersion: issueReviewVersion(draft.content, saved.updatedAt),
            reviewedTr: true as const,
            reviewedEn: true as const,
          };
          const refused = (code: string) => (error: unknown) =>
            error instanceof PublicationError && error.code === code;
          await assert.rejects(
            publishDraftInTransaction(
              tx,
              { ...approval, reviewVersion: "0".repeat(64) },
              now,
            ),
            refused("review_changed"),
          );
          await assert.rejects(
            publishDraftInTransaction(
              tx,
              approval,
              new Date("2099-05-31T09:00:00.000Z"),
            ),
            refused("future_edition"),
          );
          assert.equal(
            (
              await setSourceInTransaction(tx, {
                sourceKey: "hackernews",
                enabled: false,
              })
            ).status,
            "saved",
          );
          await assert.rejects(
            publishDraftInTransaction(tx, approval, now),
            refused("source_disabled"),
          );
          await setSourceInTransaction(tx, {
            sourceKey: "hackernews",
            enabled: true,
          });
          await tx.rawItem.update({
            where: { id: ids[0] },
            data: { excerpt: "The evidence was removed." },
          });
          await assert.rejects(
            publishDraftInTransaction(tx, approval, now),
            refused("invalid_evidence"),
          );
          await tx.rawItem.update({
            where: { id: ids[0] },
            data: { excerpt: fixture.pool[0].sourceText },
          });
          const result = await publishDraftInTransaction(tx, approval, now);
          assert.equal(result.status, "published");
          const published = await tx.issue.findUniqueOrThrow({
            where: { id: issue.id },
          });
          assert.deepEqual(published.content, saved.content);
          assert.deepEqual(published.generationUsage, saved.generationUsage);
          assert.equal(published.publishedAt?.toISOString(), now.toISOString());
          assert.equal(published.deliveryStartedAt, null);
          assert.equal(published.deliveryFinishedAt, null);
          assert.equal(saved.editionNumber, null);
          assert.equal(published.editionNumber, before.nextNumber);
          assert.equal(await nextEditionNumber(tx), before.nextNumber + 1);
          assert.equal(
            await tx.rawItem.count({ where: { usedIssueId: issue.id } }),
            fixture.pool.length,
          );
          assert.equal(
            (
              await publishDraftInTransaction(
                tx,
                approval,
                new Date(now.getTime() + 60_000),
              )
            ).status,
            "already_published",
          );
          assert.equal(await nextEditionNumber(tx), before.nextNumber + 1);
          assert.equal(
            (
              await tx.issue.findUniqueOrThrow({ where: { id: issue.id } })
            ).publishedAt?.toISOString(),
            now.toISOString(),
          );
          await setSourceInTransaction(tx, {
            sourceKey: "hackernews",
            enabled: false,
          });
          assert.deepEqual(
            (await tx.issue.findUniqueOrThrow({ where: { id: issue.id } }))
              .content,
            saved.content,
          );
          await setSourceInTransaction(tx, {
            sourceKey: "hackernews",
            enabled: true,
          });
          throw new RollbackCheck();
        },
        { maxWait: 5000, timeout: 20_000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackCheck)) throw error;
    }
    assert.equal(await db.issue.count(), before.issues);
    assert.equal(await db.rawItem.count(), before.items);
    assert.equal(await nextEditionNumber(db), before.nextNumber);
    console.log(
      "Publication storage checks passed; fixtures and source changes were rolled back",
    );
  } finally {
    if (lease) await releasePipelineLease(lease);
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Publication storage check failed. Check database access, hackernews state, and the reserved fixture date.",
  );
  process.exitCode = 1;
});
