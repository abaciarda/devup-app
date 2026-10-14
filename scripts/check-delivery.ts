import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Webhook } from "svix";
import { resendProvider } from "../lib/server/resend-provider";
import { deliveryDecision, retryWindowMs } from "../lib/server/delivery-policy";
import {
  verifyEmailWebhook,
  readWebhookBody,
} from "../lib/server/webhook-verification";
import { emailEventSchema } from "../lib/server/delivery-webhooks";
import { deliveryEnvSchema } from "../lib/server/delivery-env";
import type { FrozenEmail } from "../lib/email/contracts";

async function main() {
  const sendId = randomUUID();
  const message: FrozenEmail = {
    idempotencyKey: `issue/${sendId}`,
    payload: {
      from: "devup <news@devup.example>",
      to: ["reader@example.com"],
      reply_to: "hello@devup.example",
      subject: "Fixture",
      html: "<p>Fixture</p>",
      text: "Fixture",
      tags: [
        { name: "send_id", value: sendId },
        { name: "kind", value: "issue" },
      ],
    },
  };
  const seen: { body: string; key: string }[] = [];
  const providerId = randomUUID();
  let attempts = 0;
  const transport: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    seen.push({
      body: String(init?.body),
      key: new Headers(init?.headers).get("Idempotency-Key")!,
    });
    if (!attempts++) throw new Error("Lost response");
    return Response.json({ id: providerId });
  };
  const provider = resendProvider("re_fixture", transport);
  assert.equal((await provider(message)).kind, "unknown");
  assert.deepEqual(await provider(message), { kind: "accepted", providerId });
  assert.deepEqual(seen[0], seen[1]);
  const classify = (status: number, body: unknown, retry = "60") =>
    resendProvider("re_fixture", async () =>
      Response.json(body, { status, headers: { "Retry-After": retry } }),
    )(message);
  assert.equal((await classify(503, {})).kind, "unknown");
  assert.equal((await classify(422, {})).kind, "rejected");
  const limited = await classify(429, {}, "120");
  assert.equal(limited.kind, "rejected");
  assert.ok(limited.retryable && limited.retryAfter === 120);
  const conflict = await classify(409, { name: "invalid_idempotent_request" });
  assert.ok(conflict.kind === "unknown" && !conflict.retryable);
  const concurrent = await classify(409, {
    name: "concurrent_idempotent_requests",
  });
  assert.ok(concurrent.kind === "unknown" && concurrent.retryable);
  const now = new Date();
  const unknown = {
    kind: "unknown" as const,
    code: "fixture",
    retryable: true,
    retryAfter: 60,
  };
  assert.equal(deliveryDecision(unknown, 1, now, false, now).retryable, true);
  assert.equal(deliveryDecision(unknown, 6, now, false, now).needsReview, true);
  assert.equal(
    deliveryDecision(
      unknown,
      2,
      new Date(now.getTime() - retryWindowMs),
      false,
      now,
    ).needsReview,
    true,
  );
  assert.equal(
    deliveryDecision(
      { kind: "rejected", code: "fixture", retryable: false, retryAfter: 60 },
      2,
      now,
      true,
      now,
    ).status,
    "unknown",
  );
  const secret = `whsec_${randomBytes(32).toString("base64")}`;
  const webhook = new Webhook(secret);
  const id = "msg_fixture";
  const raw = JSON.stringify({
    type: "email.delivered",
    created_at: now.toISOString(),
    data: {
      email_id: providerId,
      tags: { send_id: sendId, kind: "issue" },
      to: ["reader@example.com"],
    },
  });
  const headers = new Headers({
    "svix-id": id,
    "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
    "svix-signature": webhook.sign(id, now, raw),
  });
  assert.ok(
    emailEventSchema.safeParse(verifyEmailWebhook(raw, headers, secret))
      .success,
  );
  assert.throws(() => verifyEmailWebhook(`${raw} `, headers, secret));
  const stale = new Date(now.getTime() - 600_000);
  assert.throws(() =>
    verifyEmailWebhook(
      raw,
      new Headers({
        "svix-id": id,
        "svix-timestamp": String(Math.floor(stale.getTime() / 1000)),
        "svix-signature": webhook.sign(id, stale, raw),
      }),
      secret,
    ),
  );
  assert.equal(
    await readWebhookBody(
      new Request("https://devup.example", {
        method: "POST",
        body: "a".repeat(65537),
      }),
    ),
    null,
  );
  assert.equal(deliveryEnvSchema.parse({}).EMAIL_DELIVERY_ENABLED, "false");
  console.log(
    "Provider timeout/rejection/conflict classification, identical retries, bounded review window, signed webhook/tamper/stale checks and safe launch defaults passed; no provider calls",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
