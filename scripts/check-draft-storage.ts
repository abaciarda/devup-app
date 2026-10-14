import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/server/database/client";
import { validateModelDraft } from "../lib/server/issues/draft-content";
import {
  loadDraftCandidates,
  recordGenerationFailure,
  saveReadyDraft,
} from "../lib/server/issues/draft-storage";
import { GenerationFailure, type GenerationRun } from "../lib/server/issues/gemini";
import {
  acquirePipelineLease,
  releasePipelineLease,
  renewPipelineLease,
} from "../lib/server/operations/lease";
import { draftFixture } from "./draft-fixture";

class RollbackCheck extends Error {}

async function main() {
  const db = getDb();
  let lease: Awaited<ReturnType<typeof acquirePipelineLease>> = null;
  try {
    lease = await acquirePipelineLease();
    if (!lease) throw new Error("Pipeline is busy; retry this check later");
    const before = {
      issues: await db.issue.count(),
      items: await db.rawItem.count(),
    };
    const owner = lease;
    try {
      await db.$transaction(
        async (tx) => {
          if (!(await renewPipelineLease(owner, 600, tx)))
            throw new Error("Lease lost");
          const now = new Date("2099-04-01T09:00:00.000Z");
          const source = await tx.source.findUniqueOrThrow({
            where: { key: "devto" },
          });
          if (!source.enabled)
            throw new Error("Enable devto before this check");
          const issue = await tx.issue.create({
            data: { editionDate: new Date("2099-04-01T00:00:00.000Z") },
          });
          const otherIssue = await tx.issue.create({
            data: { editionDate: new Date("2099-04-02T00:00:00.000Z") },
          });
          const initial = draftFixture(now);
          const ids: number[] = [];
          for (const candidate of initial.pool) {
            const item = await tx.rawItem.create({
              data: {
                sourceId: source.id,
                externalId: `draft-check-${randomUUID()}`,
                title: candidate.title,
                originalUrl: candidate.originalUrl,
                normalizedUrl: candidate.normalizedUrl,
                excerpt: candidate.sourceText,
                publishedAt: now,
                fetchedAt: now,
                tags: candidate.tags,
              },
            });
            ids.push(item.id);
          }
          const fixture = draftFixture(now, ids);
          for (const candidate of fixture.pool) {
            await tx.rawItem.update({
              where: { id: candidate.rawItemId },
              data: {
                originalUrl: candidate.originalUrl,
                normalizedUrl: candidate.normalizedUrl,
              },
            });
          }
          const run: GenerationRun = {
            draft: validateModelDraft(fixture.output, fixture.pool),
            model: "fixture-model",
            attempts: [],
          };
          await saveReadyDraft(tx, issue.id, run, fixture.pool, now);
          const saved = await tx.issue.findUniqueOrThrow({
            where: { id: issue.id },
          });
          assert.equal(saved.generationStatus, "ready");
          assert.equal(saved.publishedAt, null);
          assert.equal(
            await tx.rawItem.count({ where: { usedIssueId: issue.id } }),
            5,
          );
          assert.equal(
            (await loadDraftCandidates(issue.id, now, tx)).length,
            5,
          );
          assert.equal(
            await recordGenerationFailure(tx, issue.id, "http_429", [], now),
            true,
          );
          const preserved = await tx.issue.findUniqueOrThrow({
            where: { id: issue.id },
          });
          assert.deepEqual(preserved.content, saved.content);
          assert.equal(preserved.generationModel, saved.generationModel);
          assert.equal(preserved.generationStatus, "ready");
          assert.equal(preserved.generationError, "http_429");
          assert.equal(
            await tx.rawItem.count({ where: { usedIssueId: issue.id } }),
            5,
          );
          await saveReadyDraft(tx, issue.id, run, fixture.pool, now);
          assert.equal(
            (await tx.issue.findUniqueOrThrow({ where: { id: issue.id } }))
              .generationError,
            null,
          );
          await tx.rawItem.update({
            where: { id: ids[0] },
            data: { usedIssueId: otherIssue.id },
          });
          assert.equal(
            (await loadDraftCandidates(issue.id, now, tx)).length,
            4,
          );
          await assert.rejects(
            saveReadyDraft(tx, issue.id, run, fixture.pool, now),
            (error: unknown) =>
              error instanceof GenerationFailure &&
              error.code === "candidate_conflict",
          );
          await tx.rawItem.update({
            where: { id: ids[0] },
            data: { usedIssueId: issue.id },
          });
          await tx.issue.update({
            where: { id: issue.id },
            data: { publishedAt: now },
          });
          await assert.rejects(
            saveReadyDraft(tx, issue.id, run, fixture.pool, now),
            (error: unknown) =>
              error instanceof GenerationFailure &&
              error.code === "issue_locked",
          );
          assert.equal(
            await recordGenerationFailure(
              tx,
              otherIssue.id,
              "insufficient_candidates",
              [],
              now,
            ),
            false,
          );
          assert.equal(
            (await tx.issue.findUniqueOrThrow({ where: { id: otherIssue.id } }))
              .generationStatus,
            "failed",
          );
          throw new RollbackCheck();
        },
        { maxWait: 5000, timeout: 20_000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackCheck)) throw error;
    }
    assert.equal(await db.issue.count(), before.issues);
    assert.equal(await db.rawItem.count(), before.items);
    console.log("Draft storage check passed; synthetic rows were rolled back");
  } finally {
    if (lease) await releasePipelineLease(lease);
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Draft storage check failed. Check source state, reserved fixture dates, and database access.",
  );
  process.exitCode = 1;
});
