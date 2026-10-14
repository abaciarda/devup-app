import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/server/database/client";
import { cleanupInTransaction } from "../lib/server/operations/cleanup";
import { reserveScheduledGeneration } from "../lib/server/operations/pipeline";
import { emailFixture } from "./email-fixture";

class RollbackCheck extends Error {}
async function main() {
  const db = getDb();
  try {
    try {
      await db.$transaction(
        async (tx) => {
          const now = new Date();
          const old = new Date(now.getTime() - 100 * 86400_000);
          const issue = await tx.issue.create({
            data: {
              editionDate: new Date("2099-12-12T00:00:00Z"),
              content: emailFixture().issue.content,
            },
          });
          assert.ok(await reserveScheduledGeneration(tx, issue.id));
          assert.equal(await reserveScheduledGeneration(tx, issue.id), false);
          assert.equal(
            (await tx.issue.findUniqueOrThrow({ where: { id: issue.id } }))
              .publishedAt,
            null,
          );
          const create = (name: string, data: object) =>
            tx.subscriber.create({
              data: {
                email: `task12-${name}-${randomUUID()}@example.com`,
                language: "en",
                consentAt: old,
                consentVersion: "fixture",
                ...data,
              },
            });
          const unknown = await create("unknown", {
            confirmationStatus: "unknown",
            confirmationAttempts: 1,
            confirmationNeedsReview: true,
            confirmationPayload: { fixture: true },
            confirmationTokenHash: randomUUID()
              .replaceAll("-", "")
              .padEnd(64, "0"),
            confirmationExpiresAt: old,
            updatedAt: old,
          });
          const renewed = await create("renewed", {
            confirmationStatus: "pending",
            confirmationAttempts: 0,
            confirmationPayload: { fixture: true },
            confirmationTokenHash: randomUUID()
              .replaceAll("-", "")
              .padEnd(64, "0"),
            confirmationExpiresAt: new Date(now.getTime() + 86400_000),
            updatedAt: old,
          });
          const unused = await create("unused", {
            confirmationStatus: "pending",
            confirmationAttempts: 0,
            confirmationExpiresAt: old,
            updatedAt: old,
          });
          const suppressed = await create("suppressed", {
            status: "suppressed",
            suppressionReason: "fixture",
            updatedAt: old,
          });
          const sendId = randomUUID();
          const accepted = await tx.sendLog.create({
            data: {
              id: sendId,
              issueId: issue.id,
              subscriberId: suppressed.id,
              subscriptionVersion: 1,
              language: "en",
              status: "accepted",
              payload: { privateFixture: true },
              idempotencyKey: `issue/${sendId}`,
              updatedAt: old,
            },
          });
          const unknownId = randomUUID();
          await tx.sendLog.create({
            data: {
              id: unknownId,
              issueId: issue.id,
              subscriberId: unknown.id,
              subscriptionVersion: 1,
              language: "en",
              status: "unknown",
              needsReview: true,
              payload: { privateFixture: true },
              idempotencyKey: `issue/${unknownId}`,
              updatedAt: old,
            },
          });
          const preview = await cleanupInTransaction(tx, now, false);
          assert.equal(preview.state, "preview");
          assert.deepEqual(
            (await tx.sendLog.findUniqueOrThrow({ where: { id: accepted.id } }))
              .payload,
            accepted.payload,
          );
          const result = await cleanupInTransaction(tx, now, true);
          assert.equal(result.state, "complete");
          assert.equal(
            await tx.subscriber.findUnique({ where: { id: unused.id } }),
            null,
          );
          assert.equal(
            (
              await tx.subscriber.findUniqueOrThrow({
                where: { id: suppressed.id },
              })
            ).status,
            "suppressed",
          );
          assert.deepEqual(
            (
              await tx.subscriber.findUniqueOrThrow({
                where: { id: unknown.id },
              })
            ).confirmationPayload,
            { fixture: true },
          );
          assert.deepEqual(
            (
              await tx.subscriber.findUniqueOrThrow({
                where: { id: renewed.id },
              })
            ).confirmationPayload,
            { fixture: true },
          );
          assert.deepEqual(
            (await tx.sendLog.findUniqueOrThrow({ where: { id: accepted.id } }))
              .payload,
            { version: 1, redacted: true },
          );
          assert.deepEqual(
            (await tx.sendLog.findUniqueOrThrow({ where: { id: unknownId } }))
              .payload,
            { privateFixture: true },
          );
          throw new RollbackCheck();
        },
        { maxWait: 5000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackCheck)) throw error;
    }
    console.log(
      "Scheduled generation cap, no auto-publication, preview-only cleanup, terminal redaction, renewed/unknown preservation and suppression retention passed; all fixtures rolled back",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
