import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../lib/server/db";
import { subscriptionEnvSchema } from "../lib/server/subscription-env";
import {
  createSubscriberLink,
  verifySubscriberLink,
} from "../lib/server/subscriber-links";
import {
  subscribeInTransaction,
  confirmInTransaction,
  unsubscribeInTransaction,
  preferencesInTransaction,
  type ConfirmationWork,
} from "../lib/server/subscriptions";
import { emailFixture } from "./email-fixture";

class RollbackCheck extends Error {}

async function main() {
  const db = getDb();
  try {
    try {
      await db.$transaction(
        async (tx) => {
          const env = subscriptionEnvSchema.parse({
            SITE_URL: "https://devup.example",
            SUBSCRIBER_LINK_SECRET: randomBytes(32).toString("base64url"),
            CONSENT_VERSION: "fixture",
          });
          const email = `task10-${randomUUID()}@example.com`;
          const input = {
            email,
            language: "en" as const,
            consent: "yes" as const,
            website: "",
          };
          const work = (): ConfirmationWork => {
            const sendId = randomUUID();
            return {
              sendId,
              token: randomBytes(32).toString("base64url"),
              message: {
                idempotencyKey: `confirmation/${sendId}`,
                payload: {
                  from: "devup <news@devup.example>",
                  to: [email],
                  reply_to: "hello@devup.example",
                  subject: "Fixture",
                  html: "<p>Fixture</p>",
                  text: "Fixture",
                  tags: [
                    { name: "send_id", value: sendId },
                    { name: "kind", value: "confirmation" },
                  ],
                },
              },
            };
          };
          const first = work();
          await subscribeInTransaction(tx, input, first, env);
          let subscriber = await tx.subscriber.findUniqueOrThrow({
            where: { email },
          });
          assert.equal(subscriber.status, "pending");
          assert.notEqual(subscriber.confirmationTokenHash, first.token);
          await subscribeInTransaction(
            tx,
            { ...input, language: "tr" },
            work(),
            env,
          );
          assert.deepEqual(
            await tx.subscriber.findUniqueOrThrow({ where: { email } }),
            subscriber,
          );
          assert.equal(
            await confirmInTransaction(
              tx,
              first.token,
              new Date(Date.now() + 86400_000),
            ),
            false,
          );
          assert.equal(await confirmInTransaction(tx, first.token), true);
          assert.equal(await confirmInTransaction(tx, first.token), false);
          subscriber = await tx.subscriber.findUniqueOrThrow({
            where: { email },
          });
          assert.equal(subscriber.confirmationTokenHash, null);
          assert.equal(subscriber.confirmationPayload, null);
          const link = (purpose: "unsubscribe" | "preferences") =>
            verifySubscriberLink(
              createSubscriberLink(purpose, subscriber, env),
              purpose,
              env,
            )!;
          const preference = link("preferences");
          const unsubscribe = link("unsubscribe");
          const fixture = emailFixture();
          const issue = await tx.issue.create({
            data: {
              editionDate: new Date("2099-10-10T00:00:00Z"),
              content: fixture.issue.content,
            },
          });
          const queued = await tx.sendLog.create({
            data: {
              id: randomUUID(),
              issueId: issue.id,
              subscriberId: subscriber.id,
              subscriptionVersion: subscriber.subscriptionVersion,
              language: "en",
              payload: { fixture: true },
              idempotencyKey: `issue/${randomUUID()}`,
            },
          });
          assert.ok(await preferencesInTransaction(tx, preference, "tr"));
          assert.deepEqual(
            (await tx.sendLog.findUniqueOrThrow({ where: { id: queued.id } }))
              .payload,
            queued.payload,
          );
          await subscribeInTransaction(tx, input, work(), env);
          assert.equal(
            (await tx.subscriber.findUniqueOrThrow({ where: { email } }))
              .language,
            "tr",
          );
          await unsubscribeInTransaction(tx, unsubscribe);
          assert.equal(
            (await tx.sendLog.findUniqueOrThrow({ where: { id: queued.id } }))
              .status,
            "suppressed",
          );
          assert.equal(
            await preferencesInTransaction(tx, preference, "en"),
            false,
          );
          const next = work();
          await subscribeInTransaction(tx, input, next, env);
          subscriber = await tx.subscriber.findUniqueOrThrow({
            where: { email },
          });
          assert.equal(subscriber.subscriptionVersion, 3);
          await unsubscribeInTransaction(tx, unsubscribe);
          assert.equal(
            (await tx.subscriber.findUniqueOrThrow({ where: { email } }))
              .status,
            "pending",
          );
          assert.ok(await confirmInTransaction(tx, next.token));
          await tx.subscriber.update({
            where: { email },
            data: { status: "suppressed" },
          });
          await subscribeInTransaction(tx, input, work(), env);
          assert.equal(
            (await tx.subscriber.findUniqueOrThrow({ where: { email } }))
              .status,
            "suppressed",
          );
          await tx.subscriber.update({
            where: { email },
            data: {
              status: "pending",
              confirmationStatus: "unknown",
              confirmationNeedsReview: true,
              confirmationExpiresAt: new Date(0),
            },
          });
          const uncertain = await tx.subscriber.findUniqueOrThrow({
            where: { email },
          });
          await subscribeInTransaction(tx, input, work(), env);
          assert.deepEqual(
            await tx.subscriber.findUniqueOrThrow({ where: { email } }),
            uncertain,
          );
          await tx.subscriber.update({
            where: { email },
            data: {
              confirmationStatus: "failed",
              confirmationNeedsReview: false,
              confirmationAttempts: 0,
            },
          });
          const replacement = work();
          await subscribeInTransaction(tx, input, replacement, env);
          assert.equal(
            (await tx.subscriber.findUniqueOrThrow({ where: { email } }))
              .confirmationSendId,
            replacement.sendId,
          );
          assert.equal(await confirmInTransaction(tx, next.token), false);
          assert.ok(await confirmInTransaction(tx, replacement.token));
          throw new RollbackCheck();
        },
        { maxWait: 5000, timeout: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackCheck)) throw error;
    }
    console.log(
      "Signup, token reuse/expiry/consumption, immutable queued mail, preferences, unsubscribe, stale links and suppression passed; fixtures rolled back",
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Subscription storage check failed; verify development database schema and reserved 2099-10-10 fixture date",
  );
  process.exitCode = 1;
});
