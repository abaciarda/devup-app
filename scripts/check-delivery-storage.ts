import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../lib/server/db";
import { emailFixture } from "./email-fixture";
import { saveDeliverySnapshot } from "../lib/server/delivery-snapshot";
import {
  claimDeliveryInTransaction,
  recordDeliveryOutcome,
  readDelivery,
  finishIssueDelivery,
} from "../lib/server/delivery-storage";
import { applyEmailEvent } from "../lib/server/delivery-webhooks";
import { unsubscribeInTransaction } from "../lib/server/subscriptions";
import type { FrozenEmail } from "../lib/email/contracts";

class RollbackCheck extends Error {}

async function main() {
  const db = getDb();
  try {
    try {
      await db.$transaction(
        async (tx) => {
          const now = new Date();
          const fixture = emailFixture();
          const issue = await tx.issue.create({
            data: {
              editionDate: new Date("2099-11-11T00:00:00Z"),
              generationStatus: "ready",
              content: fixture.issue.content,
              publishedAt: now,
            },
          });
          const subscriber = await tx.subscriber.create({
            data: {
              email: `task11-${randomUUID()}@example.com`,
              language: "en",
              status: "confirmed",
              consentAt: now,
              consentVersion: "fixture",
              confirmedAt: now,
            },
          });
          const frozen = (
            kind: "issue" | "confirmation",
            sendId: string,
            email = subscriber.email,
          ): FrozenEmail => ({
            idempotencyKey: `${kind}/${sendId}`,
            payload: {
              from: fixture.settings.EMAIL_FROM,
              to: [email],
              reply_to: fixture.settings.EMAIL_REPLY_TO,
              subject: "Fixture",
              html: "<p>Fixture</p>",
              text: "Fixture",
              tags: [
                { name: "send_id", value: sendId },
                { name: "kind", value: kind },
              ],
            },
          });
          const sendId = randomUUID();
          const message = frozen("issue", sendId);
          assert.ok(
            await saveDeliverySnapshot(tx, issue.id, now, [
              {
                id: sendId,
                subscriberId: subscriber.id,
                subscriptionVersion: 1,
                language: "en",
                message,
              },
            ]),
          );
          assert.equal(
            await saveDeliverySnapshot(tx, issue.id, now, []),
            false,
          );
          const ref = { kind: "issue" as const, id: sendId };
          const claimed = await claimDeliveryInTransaction(tx, ref, now);
          assert.ok(claimed);
          assert.equal((await readDelivery(tx, ref))?.status, "unknown");
          assert.equal(await claimDeliveryInTransaction(tx, ref, now), null);
          await recordDeliveryOutcome(
            tx,
            claimed,
            {
              kind: "unknown",
              code: "fixture_lost_response",
              retryable: true,
              retryAfter: 60,
            },
            now,
          );
          const later = new Date(now.getTime() + 120_000);
          const retry = await claimDeliveryInTransaction(tx, ref, later);
          assert.ok(retry && retry.uncertainBefore);
          assert.deepEqual(retry.message, claimed.message);
          const providerId = randomUUID();
          const event = (
            type:
              | "email.sent"
              | "email.delivered"
              | "email.bounced"
              | "email.complained",
            emailId = providerId,
          ) => ({
            type,
            created_at: later.toISOString(),
            data: {
              email_id: emailId,
              to: [subscriber.email],
              tags: { send_id: sendId, kind: "issue" },
              ...(type === "email.bounced"
                ? { bounce: { type: "Permanent" } }
                : {}),
            },
          });
          assert.ok(await applyEmailEvent(tx, event("email.delivered")));
          await recordDeliveryOutcome(
            tx,
            retry,
            {
              kind: "unknown",
              code: "late_timeout",
              retryable: true,
              retryAfter: 60,
            },
            later,
          );
          assert.equal((await readDelivery(tx, ref))?.status, "accepted");
          assert.ok((await readDelivery(tx, ref))?.deliveredAt);
          assert.ok(await applyEmailEvent(tx, event("email.bounced")));
          const suppressed = await tx.subscriber.findUniqueOrThrow({
            where: { id: subscriber.id },
          });
          assert.equal(suppressed.status, "suppressed");
          assert.equal(suppressed.subscriptionVersion, 2);
          await applyEmailEvent(tx, event("email.bounced"));
          await applyEmailEvent(tx, event("email.delivered"));
          assert.equal(
            (
              await tx.subscriber.findUniqueOrThrow({
                where: { id: subscriber.id },
              })
            ).subscriptionVersion,
            2,
          );
          assert.equal((await readDelivery(tx, ref))?.status, "failed");
          assert.ok((await readDelivery(tx, ref))?.bouncedAt);
          assert.equal(await claimDeliveryInTransaction(tx, ref, later), null);
          const confirmationId = randomUUID();
          const pending = await tx.subscriber.create({
            data: {
              email: `task11-confirm-${randomUUID()}@example.com`,
              language: "tr",
              consentAt: now,
              consentVersion: "fixture",
              confirmationSendId: confirmationId,
              confirmationPayload: frozen(
                "confirmation",
                confirmationId,
                "placeholder@example.com",
              ).payload,
              confirmationIdempotencyKey: `confirmation/${confirmationId}`,
              confirmationStatus: "pending",
              confirmationExpiresAt: new Date(now.getTime() + 86400_000),
              confirmationTokenHash: randomBytes(32).toString("hex"),
            },
          });
          await tx.subscriber.update({
            where: { id: pending.id },
            data: {
              confirmationPayload: frozen(
                "confirmation",
                confirmationId,
                pending.email,
              ).payload,
            },
          });
          const confirmation = await claimDeliveryInTransaction(
            tx,
            { kind: "confirmation", id: pending.id },
            now,
          );
          assert.ok(confirmation);
          assert.equal(
            await tx.confirmationSend.count({ where: { id: confirmationId } }),
            1,
          );
          await recordDeliveryOutcome(
            tx,
            confirmation,
            {
              kind: "unknown",
              code: "fixture",
              retryable: true,
              retryAfter: 60,
            },
            now,
          );
          assert.equal(
            await claimDeliveryInTransaction(
              tx,
              { kind: "confirmation", id: pending.id },
              new Date(now.getTime() + 23 * 3600_000),
            ),
            null,
          );
          assert.ok(
            (await readDelivery(tx, { kind: "confirmation", id: pending.id }))
              ?.needsReview,
          );
          await tx.subscriber.update({
            where: { id: pending.id },
            data: {
              confirmationSendId: randomUUID(),
              confirmationStatus: "pending",
              confirmationNeedsReview: false,
            },
          });
          const confirmationProvider = randomUUID();
          assert.ok(
            await applyEmailEvent(tx, {
              type: "email.complained",
              created_at: later.toISOString(),
              data: {
                email_id: confirmationProvider,
                to: [pending.email],
                tags: { send_id: confirmationId, kind: "confirmation" },
              },
            }),
          );
          assert.equal(
            (
              await tx.subscriber.findUniqueOrThrow({
                where: { id: pending.id },
              })
            ).status,
            "suppressed",
          );
          const optedOut = await tx.subscriber.create({
            data: {
              email: `task11-optout-${randomUUID()}@example.com`,
              language: "en",
              status: "confirmed",
              consentAt: now,
              consentVersion: "fixture",
              confirmedAt: now,
            },
          });
          const queuedId = randomUUID();
          await tx.sendLog.create({
            data: {
              id: queuedId,
              issueId: issue.id,
              subscriberId: optedOut.id,
              subscriptionVersion: 1,
              language: "en",
              payload: frozen("issue", queuedId, optedOut.email).payload,
              idempotencyKey: `issue/${queuedId}`,
            },
          });
          await unsubscribeInTransaction(
            tx,
            {
              version: 1,
              purpose: "unsubscribe",
              id: optedOut.id,
              subscriptionVersion: 1,
              issuedAt: Math.floor(now.getTime() / 1000),
              expiresAt: null,
            },
            now,
          );
          assert.equal(
            await claimDeliveryInTransaction(
              tx,
              { kind: "issue", id: queuedId },
              later,
            ),
            null,
          );
          await tx.subscriber.update({
            where: { id: pending.id },
            data: {
              status: "pending",
              confirmationStatus: "unknown",
              confirmationNeedsReview: false,
              confirmationRetryable: true,
              confirmationFirstAttemptAt: null,
            },
          });
          assert.equal(
            await claimDeliveryInTransaction(
              tx,
              { kind: "confirmation", id: pending.id },
              later,
            ),
            null,
          );
          assert.ok(
            (await readDelivery(tx, { kind: "confirmation", id: pending.id }))
              ?.needsReview,
          );
          await finishIssueDelivery(tx, issue.id, later);
          assert.ok(
            (await tx.issue.findUniqueOrThrow({ where: { id: issue.id } }))
              .deliveryFinishedAt,
          );
          assert.deepEqual(
            (await tx.sendLog.findUniqueOrThrow({ where: { id: sendId } }))
              .payload,
            message.payload,
          );
          throw new RollbackCheck();
        },
        { maxWait: 5000, timeout: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackCheck)) throw error;
    }
    console.log(
      "Atomic snapshot, crash/unknown claims, identical retries, early/replayed/out-of-order webhooks, suppression, expired review window, archived confirmation correlation, opt-out and completion passed; fixtures rolled back",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
