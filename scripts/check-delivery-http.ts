import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { Webhook } from "svix";
import { getDb } from "../lib/server/database/client";
import { createAdminSession } from "../lib/server/admin/session";
import { createSubscriptionProof } from "../lib/server/subscriptions/links";
import { subscriptionEnvSchema } from "../lib/server/subscriptions/env";
import { emailFixture } from "./email-fixture";

async function main() {
  const marker = randomUUID().replaceAll("-", "");
  const schema = `task11_${marker}`;
  assert.match(schema, /^task11_[a-f0-9]{32}$/);
  const connection = new URL(process.env.DATABASE_URL!);
  if (connection.hostname === "pooled.db.prisma.io")
    connection.hostname = "db.prisma.io";
  const pool = new Pool({
    connectionString: connection.toString(),
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ],
    { maxBuffer: 2_000_000 },
  );
  const client = await pool.connect();
  let created = false;
  let server: ReturnType<typeof spawn> | undefined;
  let db: ReturnType<typeof getDb> | undefined;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    await client.query(
      stdout
        .replace('CREATE SCHEMA IF NOT EXISTS "public";', "")
        .replace(/^--.*$/gm, ""),
    );
    await client.query("COMMIT");
    created = true;
    connection.searchParams.set("schema", schema);
    connection.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = connection.toString();
    db = getDb();
    const env = subscriptionEnvSchema.parse({
      SITE_URL: "https://devup.example",
      SUBSCRIBER_LINK_SECRET: randomBytes(32).toString("base64url"),
      CONSENT_VERSION: "fixture",
      SUBSCRIPTIONS_ENABLED: "true",
      SUBSCRIPTION_IP_HEADER: "x-vercel-forwarded-for",
    });
    const admin = {
      SITE_URL: env.SITE_URL,
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      ADMIN_PASSWORD_HASH: `scrypt:32768:8:3:${"a".repeat(32)}:${"b".repeat(64)}`,
    };
    const secret = `whsec_${randomBytes(32).toString("base64")}`;
    const cookie = `__Host-devup-admin=${createAdminSession(admin)}`;
    const base = "http://127.0.0.1:3413";
    server = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(resolve("scripts/delivery-provider-fixture.mjs")).href,
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3413",
      ],
      {
        env: {
          ...process.env,
          ...env,
          ...admin,
          NODE_ENV: "production",
          PUBLIC_LAUNCH_APPROVED: "true",
          DEVUP_DELIVERY_FIXTURE: "enabled",
          EMAIL_DELIVERY_ENABLED: "true",
          RESEND_API_KEY: "re_fixture",
          RESEND_WEBHOOK_SECRET: secret,
          EMAIL_FROM: "devup <news@devup.example>",
          EMAIL_REPLY_TO: "hello@devup.example",
          POSTAL_ADDRESS: "Example operator, Example Street 1, Istanbul",
        },
        stdio: "ignore",
      },
    );
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (server.exitCode !== null)
        throw new Error("Test server could not start");
      try {
        if (
          (
            await fetch(`${base}/privacy`, {
              signal: AbortSignal.timeout(2000),
            })
          ).ok
        ) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready);
    const post = (
      path: string,
      values: Record<string, string>,
      authorized = false,
    ) =>
      fetch(`${base}${path}`, {
        method: "POST",
        redirect: "manual",
        headers: {
          origin: env.SITE_URL,
          "x-vercel-forwarded-for": "192.0.2.51",
          ...(authorized ? { cookie } : {}),
        },
        body: new URLSearchParams(values),
        signal: AbortSignal.timeout(55_000),
      });
    const email = `task11-http-${marker}@example.com`;
    assert.equal(
      (
        await post("/api/subscribe", {
          email,
          language: "tr",
          consent: "yes",
          website: "",
        })
      ).status,
      202,
    );
    const pending = await db.subscriber.findUniqueOrThrow({ where: { email } });
    const token = (pending.confirmationPayload as { text: string }).text.match(
      /\/confirm\?token=([A-Za-z0-9_-]{43})/,
    )?.[1];
    assert.ok(token);
    assert.equal(
      (await post("/api/admin/delivery", { mode: "confirmations" })).status,
      401,
    );
    assert.equal(
      (await post("/api/admin/delivery", { mode: "confirmations" }, true))
        .status,
      303,
    );
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } }))
        .confirmationStatus,
      "accepted",
    );
    assert.equal(await db.confirmationSend.count(), 1);
    assert.equal(
      (
        await post("/api/confirm", {
          token,
          proof: createSubscriptionProof(token, "confirm", env),
        })
      ).status,
      303,
    );
    const issue = await db.issue.create({
      data: {
        editionDate: new Date("2099-11-12T00:00:00Z"),
        editionNumber: 1,
        generationStatus: "ready",
        content: emailFixture().issue.content,
        publishedAt: new Date(),
      },
    });
    assert.equal(
      (
        await post(
          "/api/admin/delivery",
          { mode: "issue", issueId: String(issue.id) },
          true,
        )
      ).status,
      303,
    );
    let send = await db.sendLog.findFirstOrThrow({
      where: { issueId: issue.id },
    });
    assert.equal(send.status, "unknown");
    assert.equal(send.language, "tr");
    const payload = send.payload;
    const key = send.idempotencyKey;
    await db.sendLog.update({
      where: { id: send.id },
      data: { nextAttemptAt: new Date(0) },
    });
    assert.equal(
      (
        await post(
          "/api/admin/delivery",
          { mode: "issue", issueId: String(issue.id) },
          true,
        )
      ).status,
      303,
    );
    send = await db.sendLog.findUniqueOrThrow({ where: { id: send.id } });
    assert.equal(send.status, "accepted");
    assert.equal(send.attempts, 2);
    assert.equal(send.idempotencyKey, key);
    assert.deepEqual(send.payload, payload);
    assert.ok(send.providerId);
    assert.ok(
      (await db.issue.findUniqueOrThrow({ where: { id: issue.id } }))
        .deliveryFinishedAt,
    );
    const reconciled = await post(
      "/api/admin/delivery",
      {
        mode: "reconcile",
        kind: "issue",
        id: send.id,
        providerId: send.providerId!,
      },
      true,
    );
    assert.equal(reconciled.status, 303);
    assert.match(
      reconciled.headers.get("location") ?? "",
      /notice=delivery_reconciled$/,
    );
    const webhook = new Webhook(secret);
    const event = async (
      type: "email.delivered" | "email.bounced",
      valid = true,
    ) => {
      const at = new Date();
      const id = `msg_${randomUUID()}`;
      const raw = JSON.stringify({
        type,
        created_at: at.toISOString(),
        data: {
          email_id: send.providerId,
          to: [email],
          tags: { send_id: send.id, kind: "issue" },
          ...(type === "email.bounced"
            ? { bounce: { type: "Permanent" } }
            : {}),
        },
      });
      return fetch(`${base}/api/webhooks/resend`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "svix-id": id,
          "svix-timestamp": String(Math.floor(at.getTime() / 1000)),
          "svix-signature": valid ? webhook.sign(id, at, raw) : "v1,invalid",
        },
        body: raw,
      });
    };
    assert.equal((await event("email.bounced", false)).status, 400);
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).status,
      "confirmed",
    );
    assert.equal((await event("email.delivered")).status, 204);
    assert.equal((await event("email.bounced")).status, 204);
    assert.equal((await event("email.bounced")).status, 204);
    assert.equal((await event("email.delivered")).status, 204);
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).status,
      "suppressed",
    );
    assert.equal(
      (await db.sendLog.findUniqueOrThrow({ where: { id: send.id } })).status,
      "failed",
    );
    const workspace = await fetch(`${base}/admin`, { headers: { cookie } });
    assert.equal(workspace.status, 200);
    assert.match(await workspace.text(), /Email delivery/);
    const secondEmail = `task11-http-${randomUUID()}@example.com`;
    assert.equal(
      (
        await post("/api/subscribe", {
          email: secondEmail,
          language: "en",
          consent: "yes",
          website: "",
        })
      ).status,
      202,
    );
    await db.rateLimit.update({
      where: {
        key: `email:daily-attempts:${new Date().toISOString().slice(0, 10)}`,
      },
      data: { hits: 90 },
    });
    const exhausted = await post(
      "/api/admin/delivery",
      { mode: "confirmations" },
      true,
    );
    assert.match(
      exhausted.headers.get("location") ?? "",
      /notice=delivery_daily_limit$/,
    );
    assert.equal(
      (await db.subscriber.findUniqueOrThrow({ where: { email: secondEmail } }))
        .confirmationAttempts,
      0,
    );
    await db.rateLimit.update({
      where: {
        key: `email:daily-attempts:${new Date().toISOString().slice(0, 10)}`,
      },
      data: { hits: 0 },
    });
    const limitedEmail = `task11-http-limited-${marker}@example.com`;
    assert.equal(
      (
        await post("/api/subscribe", {
          email: limitedEmail,
          language: "en",
          consent: "yes",
          website: "",
        })
      ).status,
      202,
    );
    await post("/api/admin/delivery", { mode: "confirmations" }, true);
    assert.equal(
      (
        await db.subscriber.findUniqueOrThrow({
          where: { email: limitedEmail },
        })
      ).confirmationStatus,
      "failed",
    );
    assert.ok(
      (
        await db.rateLimit.findUniqueOrThrow({
          where: { key: "email:provider-cooldown" },
        })
      ).expiresAt > new Date(),
    );
    const paused = await post("/api/admin/delivery", { mode: "retry" }, true);
    assert.match(
      paused.headers.get("location") ?? "",
      /notice=delivery_provider_backoff$/,
    );
    assert.equal(
      (
        await db.subscriber.findUniqueOrThrow({
          where: { email: limitedEmail },
        })
      ).confirmationAttempts,
      1,
    );
    console.log(
      "Isolated production HTTP: real rendering/snapshot, confirmation delivery, admin authorization, lost-response retry with unchanged payload/key, provider reconciliation, signed webhook rejection/replay/suppression and workspace passed; Resend fully mocked",
    );
  } finally {
    if (server) {
      server.kill();
      if (server.exitCode === null)
        await new Promise<void>((resolve) => {
          server!.once("exit", () => resolve());
          setTimeout(resolve, 3000);
        });
    }
    if (db) await db.$disconnect();
    await client.query("ROLLBACK").catch(() => {});
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Isolated delivery HTTP check failed; inspect test prerequisites, development schema permissions and free port 3413",
  );
  process.exitCode = 1;
});
