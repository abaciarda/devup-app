import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDb } from "../lib/server/db";
import { emailFixture } from "./email-fixture";
import { frozenEmailSchema } from "../lib/email/contracts";

class RollbackCheck extends Error {}

async function main() {
  const db = getDb();
  try {
    try {
      await db.$transaction(
        async (tx) => {
          const fixture = emailFixture();
          const marker = randomUUID();
          const subscriber = await tx.subscriber.create({
            data: {
              email: `devup-check-${marker}@example.com`,
              language: "en",
              consentAt: new Date(),
              consentVersion: "fixture-only",
              confirmationTokenHash: marker.replaceAll("-", "").padEnd(64, "0"),
              confirmationIssuedAt: new Date(),
              confirmationExpiresAt: new Date(Date.now() + 86_400_000),
              confirmationSendId: randomUUID(),
              confirmationIdempotencyKey: `confirmation/${marker}`,
              confirmationStatus: "pending",
              confirmationPayload: { fixture: true },
            },
          });
          assert.equal(subscriber.status, "pending");
          assert.equal(subscriber.subscriptionVersion, 1);
          assert.equal(subscriber.confirmationAttempts, 0);
          assert.equal(subscriber.confirmedAt, null);
          assert.equal(
            (
              await tx.subscriber.createMany({
                data: [
                  {
                    email: subscriber.email,
                    language: "tr",
                    consentAt: new Date(),
                    consentVersion: "fixture-only",
                  },
                ],
                skipDuplicates: true,
              })
            ).count,
            0,
          );
          const issue = await tx.issue.findUnique({
            where: {
              editionDate: new Date(`${fixture.issue.date}T00:00:00.000Z`),
            },
            select: { id: true },
          });
          assert.equal(
            issue,
            null,
            "Reserved 2099-04-01 date must be unused for this check",
          );
          const createdIssue = await tx.issue.create({
            data: {
              editionDate: new Date(`${fixture.issue.date}T00:00:00.000Z`),
              content: fixture.issue.content,
            },
          });
          const sendId = randomUUID();
          const payload = {
            from: fixture.settings.EMAIL_FROM,
            to: [subscriber.email],
            reply_to: fixture.settings.EMAIL_REPLY_TO,
            subject: "Storage fixture only",
            html: "<p>Storage fixture only</p>",
            text: "Storage fixture only",
            tags: [
              { name: "send_id", value: sendId },
              { name: "kind", value: "issue" },
            ],
          };
          const data = {
            id: sendId,
            issueId: createdIssue.id,
            subscriberId: subscriber.id,
            subscriptionVersion: subscriber.subscriptionVersion,
            language: "en" as const,
            payload,
            idempotencyKey: `issue/${sendId}`,
          };
          const send = await tx.sendLog.create({ data });
          assert.equal(send.status, "pending");
          assert.equal(send.attempts, 0);
          assert.equal(send.providerId, null);
          assert.equal(send.firstAttemptAt, null);
          assert.deepEqual(send.payload, payload);
          assert.deepEqual(
            frozenEmailSchema.parse({
              idempotencyKey: send.idempotencyKey,
              payload: send.payload,
            }).payload,
            payload,
          );
          assert.equal(
            (
              await tx.sendLog.createMany({
                data: [
                  {
                    ...data,
                    id: randomUUID(),
                    idempotencyKey: `issue/${randomUUID()}`,
                  },
                ],
                skipDuplicates: true,
              })
            ).count,
            0,
          );
          const suppressed = await tx.subscriber.update({
            where: { id: subscriber.id },
            data: {
              status: "suppressed",
              suppressedAt: new Date(),
              suppressionReason: "fixture-only",
              subscriptionVersion: { increment: 1 },
            },
          });
          assert.notEqual(
            suppressed.subscriptionVersion,
            send.subscriptionVersion,
          );
          const accepted = await tx.sendLog.update({
            where: { id: send.id },
            data: {
              status: "accepted",
              attempts: 1,
              providerId: randomUUID(),
              acceptedAt: new Date(),
            },
          });
          assert.equal(accepted.deliveredAt, null);
          assert.equal(
            (
              await tx.issue.findUniqueOrThrow({
                where: { id: createdIssue.id },
              })
            ).publishedAt,
            null,
          );
          throw new RollbackCheck();
        },
        { maxWait: 5000, timeout: 20_000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackCheck)) throw error;
    }
    console.log(
      "Subscriber/send-log defaults, uniqueness, JSON and version checks passed; all fixture rows rolled back",
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Email storage check failed. Check the development schema, connection, and reserved 2099-04-01 fixture date.",
  );
  process.exitCode = 1;
});
