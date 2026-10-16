import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "../lib/server/database/client";
import { subscriptionEnvSchema } from "../lib/server/subscriptions/env";
import {
  createSubscriberLink,
  createSubscriptionProof,
  subscriptionRateKey,
} from "../lib/server/subscriptions/links";
import { hashToken } from "../lib/server/shared/security";

async function main() {
  const db = getDb();
  const marker = randomUUID();
  const email = `task10-http-${marker}@example.com`;
  const env = subscriptionEnvSchema.parse({
    SITE_URL: "https://devup.example",
    SUBSCRIBER_LINK_SECRET: randomBytes(32).toString("base64url"),
    CONSENT_VERSION: "fixture",
    SUBSCRIPTIONS_ENABLED: "true",
    SUBSCRIPTION_IP_HEADER: "x-vercel-forwarded-for",
  });
  const port = 3411;
  const base = `http://127.0.0.1:${port}`;
  const ip = "192.0.2.41";
  const keys = [
    `subscribe:network:${subscriptionRateKey(`ip:${ip}`, env)}`,
    `subscribe:address:${subscriptionRateKey(email, env)}`,
  ];
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        ...env,
        NODE_ENV: "production",
        EMAIL_DELIVERY_ENABLED: "false",
        PUBLIC_LAUNCH_APPROVED: "true",
        EMAIL_FROM: "devup <news@devup.example>",
        EMAIL_REPLY_TO: "hello@devup.example",
        POSTAL_ADDRESS: "Example operator, Example Street 1, Istanbul",
      },
      stdio: "ignore",
    },
  );
  const post = (path: string, form: Record<string, string>, origin = "null") =>
    fetch(`${base}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: { origin, "x-vercel-forwarded-for": ip },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(20_000),
    });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (server.exitCode !== null)
        throw new Error("Test server could not start");
      try {
        const response = await fetch(`${base}/privacy`, {
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, "Test server did not become ready");
    const input = { email, language: "en", consent: "yes", website: "" };
    assert.equal(
      (await post("/api/subscribe", input, "https://other.example")).status,
      403,
    );
    const [signup, concurrent] = await Promise.all([
      post("/api/subscribe", input, env.SITE_URL),
      post("/api/subscribe", input, env.SITE_URL),
    ]);
    assert.equal(signup.status, 202);
    assert.equal(concurrent.status, 202);
    assert.equal(await db.subscriber.count({ where: { email } }), 1);
    assert.equal(signup.headers.get("Referrer-Policy"), "no-referrer");
    const pending = await db.subscriber.findUniqueOrThrow({ where: { email } });
    const payload = pending.confirmationPayload as { text: string };
    const confirmationUrl = payload.text.match(
      /https:\/\/devup\.example\/confirm\?token=([A-Za-z0-9_-]{43})/,
    );
    assert.ok(
      confirmationUrl,
      "Frozen confirmation email must contain a usable confirmation link",
    );
    const token = confirmationUrl[1];
    assert.equal(pending.confirmationTokenHash, hashToken(token));
    const page = await fetch(`${base}/confirm?token=${token}`);
    assert.equal(page.headers.get("Referrer-Policy"), "no-referrer");
    assert.match(page.headers.get("Cache-Control") ?? "", /no-store/);
    assert.match(await page.text(), /name="proof"/);
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).status,
      "pending",
    );
    assert.equal(
      (await post("/api/confirm", { token, proof: "x".repeat(30) })).status,
      403,
    );
    const confirmed = await post("/api/confirm", {
      token,
      proof: createSubscriptionProof(token, "confirm", env),
    });
    assert.equal(confirmed.status, 303);
    assert.equal(
      confirmed.headers.get("location"),
      `${env.SITE_URL}/subscription/result?state=confirm`,
    );
    const subscriber = await db.subscriber.findUniqueOrThrow({
      where: { email },
    });
    assert.equal(subscriber.status, "confirmed");
    const preferences = createSubscriberLink("preferences", subscriber, env);
    assert.equal(
      (
        await post("/api/preferences", {
          token: preferences,
          proof: createSubscriptionProof(preferences, "preferences", env),
          language: "tr",
        })
      ).status,
      303,
    );
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).language,
      "tr",
    );
    const unsubscribe = createSubscriberLink("unsubscribe", subscriber, env);
    await fetch(`${base}/unsubscribe?token=${unsubscribe}`);
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).status,
      "confirmed",
    );
    const oneClick = await post(
      `/api/unsubscribe?token=${unsubscribe}`,
      { "List-Unsubscribe": "One-Click" },
      "https://mailbox.example",
    );
    assert.equal(oneClick.status, 204);
    assert.equal(oneClick.headers.get("location"), null);
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).status,
      "unsubscribed",
    );
    const multipart = new FormData();
    multipart.set("List-Unsubscribe", "One-Click");
    assert.equal(
      (
        await fetch(`${base}/api/unsubscribe?token=${unsubscribe}`, {
          method: "POST",
          body: multipart,
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await post(`/api/unsubscribe?token=${preferences}`, {
          "List-Unsubscribe": "One-Click",
        })
      ).status,
      400,
    );
    assert.equal(
      (await post("/api/subscribe", input, env.SITE_URL)).status,
      202,
    );
    const renewed = await db.subscriber.findUniqueOrThrow({ where: { email } });
    assert.equal(renewed.status, "pending");
    assert.equal(renewed.subscriptionVersion, 3);
    assert.equal(
      (
        await post(`/api/unsubscribe?token=${unsubscribe}`, {
          "List-Unsubscribe": "One-Click",
        })
      ).status,
      204,
    );
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).status,
      "pending",
    );
    const limited = await post("/api/subscribe", input, env.SITE_URL);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    console.log(
      "Production HTTP signup/rendering, read-only GET, proof-protected actions, preferences, RFC 8058 form formats, stale links and shared rate limits passed",
    );
  } finally {
    server.kill();
    if (server.exitCode === null)
      await new Promise<void>((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 3000);
      });
    await db.subscriber.deleteMany({ where: { email } });
    await db.rateLimit.deleteMany({ where: { key: { in: keys } } });
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
