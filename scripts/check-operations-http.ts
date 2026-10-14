import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { getDb } from "../lib/server/database/client";
import { runPipeline } from "../lib/server/operations/pipeline";
import {
  acquirePipelineLease,
  releasePipelineLease,
} from "../lib/server/operations/lease";
import { createAdminSession } from "../lib/server/admin/session";
import { editionDateForNow } from "../lib/edition-date";
import { emailFixture } from "./email-fixture";

async function main() {
  const schema = `task12_${randomUUID().replaceAll("-", "")}`;
  assert.match(schema, /^task12_[a-f0-9]{32}$/);
  const connection = new URL(process.env.DATABASE_URL!);
  if (connection.hostname === "pooled.db.prisma.io")
    connection.hostname = "db.prisma.io";
  const pool = new Pool({
    connectionString: connection.toString(),
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const client = await pool.connect();
  let created = false;
  let server: ReturnType<typeof spawn> | undefined;
  let db: ReturnType<typeof getDb> | undefined;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    connection.searchParams.set("schema", schema);
    connection.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = connection.toString();
    const execute = promisify(execFile);
    const args = ["node_modules/prisma/build/index.js"];
    const options = { env: { ...process.env }, maxBuffer: 2_000_000 };
    await execute(process.execPath, [...args, "migrate", "deploy"], options);
    await execute(process.execPath, [...args, "migrate", "deploy"], options);
    await execute(
      process.execPath,
      [
        ...args,
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      ],
      options,
    );
    db = getDb();
    const secret = randomBytes(32).toString("base64url");
    process.env.CRON_SECRET = secret;
    process.env.PIPELINE_ENABLED = "true";
    process.env.CLEANUP_ENABLED = "true";
    const fixture = emailFixture();
    const morning = new Date("2099-12-13T04:17:00Z");
    const insufficient = await runPipeline("prepare", {
      now: () => morning,
      refresh: async () => ({
        status: "complete",
        sources: [],
        candidateCount: 0,
        enoughCandidates: false,
      }),
      generate: async () => {
        throw new Error("Generation must not run without candidates");
      },
    });
    assert.equal(insufficient.state, "needs_review");
    const second = await runPipeline("prepare", {
      now: () => morning,
      refresh: async () => {
        throw new Error("Reserved day must not refresh repeatedly");
      },
    });
    assert.equal(second.state, "needs_review");
    const attempted = await db.issue.findUniqueOrThrow({
      where: { editionDate: editionDateForNow(morning) },
    });
    assert.equal(attempted.scheduledGenerationAttempts, 1);
    assert.equal(attempted.publishedAt, null);
    const readyDay = new Date("2099-12-14T04:17:00Z");
    const ready = await db.issue.create({
      data: {
        editionDate: editionDateForNow(readyDay),
        generationStatus: "ready",
        content: fixture.issue.content,
      },
    });
    assert.equal(
      (
        await runPipeline("prepare", {
          now: () => readyDay,
          refresh: async () => {
            throw new Error("Ready draft must wait");
          },
        })
      ).state,
      "waiting_for_approval",
    );
    assert.equal(
      (await db.issue.findUniqueOrThrow({ where: { id: ready.id } }))
        .publishedAt,
      null,
    );
    const oldIssue = await db.issue.create({
      data: {
        editionDate: new Date("2099-12-10T00:00:00Z"),
        content: fixture.issue.content,
        publishedAt: new Date(),
        deliveryStartedAt: new Date(),
      },
    });
    const reviewSubscriber = await db.subscriber.create({
      data: {
        email: `task12-review-${randomUUID()}@example.com`,
        language: "en",
        status: "confirmed",
        consentAt: new Date(),
        consentVersion: "fixture",
        confirmedAt: new Date(),
      },
    });
    const unknownId = randomUUID();
    await db.sendLog.create({
      data: {
        id: unknownId,
        issueId: oldIssue.id,
        subscriberId: reviewSubscriber.id,
        subscriptionVersion: 1,
        language: "en",
        status: "unknown",
        needsReview: true,
        payload: { fixture: true },
        idempotencyKey: `issue/${unknownId}`,
      },
    });
    const freshIssue = await db.issue.create({
      data: {
        editionDate: new Date("2099-12-11T00:00:00Z"),
        content: fixture.issue.content,
        publishedAt: new Date(),
      },
    });
    await runPipeline("delivery", {
      now: () => readyDay,
      deliver: async (request, lease) => {
        assert.ok(lease);
        assert.deepEqual(request, { mode: "issue", issueId: freshIssue.id });
        return { state: "complete", attempted: 0 };
      },
    });
    const orphan = await db.issue.create({
      data: {
        editionDate: new Date("2099-12-09T00:00:00Z"),
        publishedAt: new Date(),
        deliveryStartedAt: new Date(),
      },
    });
    await runPipeline("delivery", {
      now: () => readyDay,
      deliver: async () => ({ state: "complete", attempted: 0 }),
    });
    assert.ok(
      (await db.issue.findUniqueOrThrow({ where: { id: orphan.id } }))
        .deliveryFinishedAt,
    );
    assert.equal(
      (
        await runPipeline("prepare", {
          now: () => readyDay,
          refresh: async () => {
            throw new Error("Delivery backlog must prevent new preparation");
          },
        })
      ).state,
      "delivery_pending",
    );
    const admin = {
      SITE_URL: "https://devup.example",
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      ADMIN_PASSWORD_HASH: `scrypt:32768:8:3:${"a".repeat(32)}:${"b".repeat(64)}`,
    };
    const cookie = `__Host-devup-admin=${createAdminSession(admin)}`;
    const base = "http://127.0.0.1:3414";
    await db.issue.create({
      data: {
        editionDate: editionDateForNow(),
        generationStatus: "ready",
        content: fixture.issue.content,
      },
    });
    const old = new Date(Date.now() - 100 * 86400_000);
    const expired = await db.subscriber.create({
      data: {
        email: `task12-expired-${randomUUID()}@example.com`,
        language: "en",
        consentAt: old,
        consentVersion: "fixture",
        confirmationExpiresAt: old,
        updatedAt: old,
      },
    });
    server = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(resolve("scripts/operations-network-fixture.mjs")).href,
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3414",
      ],
      {
        env: {
          ...process.env,
          ...admin,
          NODE_ENV: "production",
          DEVUP_OPERATIONS_FIXTURE: "enabled",
          EMAIL_DELIVERY_ENABLED: "false",
          SUBSCRIPTIONS_ENABLED: "false",
          PUBLIC_LAUNCH_APPROVED: "false",
          GEMINI_API_KEY: "",
          RESEND_API_KEY: "",
          RESEND_WEBHOOK_SECRET: "",
        },
        stdio: "ignore",
      },
    );
    let readyServer = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (server.exitCode !== null) throw new Error("Server failed to start");
      try {
        if (
          (
            await fetch(`${base}/privacy`, {
              signal: AbortSignal.timeout(2000),
            })
          ).ok
        ) {
          readyServer = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(readyServer);
    const scheduled = (mode: string, authorized = true) =>
      fetch(`${base}/api/pipeline/run`, {
        method: "POST",
        headers: {
          ...(authorized ? { authorization: `Bearer ${secret}` } : {}),
        },
        body: new URLSearchParams({ mode }),
      });
    assert.equal((await scheduled("prepare", false)).status, 401);
    assert.equal((await fetch(`${base}/api/pipeline/run`)).status, 405);
    const prepared = await scheduled("prepare");
    assert.ok(
      ["outside_window", "waiting_for_approval"].includes(
        (await prepared.json()).state,
      ),
    );
    assert.equal(
      (
        await db.issue.findUniqueOrThrow({
          where: { editionDate: editionDateForNow() },
        })
      ).publishedAt,
      null,
    );
    const lease = await acquirePipelineLease();
    assert.ok(lease);
    try {
      assert.equal(
        (await (await scheduled("confirmations")).json()).state,
        "busy",
      );
    } finally {
      await releasePipelineLease(lease);
    }
    const preview = await fetch(`${base}/admin/operations`, {
      headers: { cookie },
    });
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /Retention and cleanup/);
    assert.ok(await db.subscriber.findUnique({ where: { id: expired.id } }));
    assert.equal(
      (await fetch(`${base}/api/pipeline/cleanup`, { method: "POST" })).status,
      401,
    );
    const cleaned = await fetch(`${base}/api/pipeline/cleanup`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    assert.equal(cleaned.status, 200);
    assert.equal((await cleaned.json()).state, "complete");
    assert.equal(
      await db.subscriber.findUnique({ where: { id: expired.id } }),
      null,
    );
    assert.equal(await db.cleanupRun.count(), 1);
    assert.deepEqual(
      (await db.sendLog.findUniqueOrThrow({ where: { id: unknownId } }))
        .payload,
      { fixture: true },
    );
    console.log(
      "Production migrations deployed twice with no schema drift; isolated orchestration cap/approval/backlog handling, cron auth, GET rejection, lease overlap, read-only admin preview and cleanup HTTP passed; no external HTTP calls",
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
    if (created) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  if (error instanceof assert.AssertionError) console.error(error);
  else
    console.error(
      "Isolated operations check failed; verify migration chain, schema permissions and unused port 3414",
    );
  process.exitCode = 1;
});
