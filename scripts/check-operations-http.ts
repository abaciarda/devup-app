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
import { prepareManualDraft } from "../lib/server/operations/manual-preparation";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
  type PipelineLease,
} from "../lib/server/operations/lease";
import { createAdminSession } from "../lib/server/admin/session";
import { editionDateForNow } from "../lib/edition-date";
import { emailFixture } from "./email-fixture";
import { draftFixture } from "./draft-fixture";
import { validateModelDraft } from "../lib/server/issues/draft-content";
import { saveReadyDraft } from "../lib/server/issues/draft-storage";
import {
  PublicationError,
  publishAutomaticDraftInTransaction,
} from "../lib/server/issues/publication";
import { saveDeliverySnapshot } from "../lib/server/delivery/snapshot";

let stage = "database setup";

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
    stage = "existing operations checks";
    db = getDb();
    const secret = randomBytes(32).toString("base64url");
    process.env.CRON_SECRET = secret;
    process.env.PIPELINE_ENABLED = "true";
    process.env.AUTO_PUBLISH_ENABLED = "false";
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
    assert.equal(insufficient.state, "retry_scheduled");
    const second = await runPipeline("prepare", {
      now: () => morning,
      refresh: async () => {
        throw new Error("Reserved day must not refresh repeatedly");
      },
    });
    assert.equal(second.state, "retry_scheduled");
    const attempted = await db.issue.findUniqueOrThrow({
      where: { editionDate: editionDateForNow(morning) },
    });
    assert.equal(attempted.scheduledGenerationAttempts, 1);
    assert.equal(attempted.publishedAt, null);
    let retryTime = new Date("2099-12-12T03:30:00Z");
    let refreshes = 0;
    let generations = 0;
    const retryDependencies = {
      now: () => retryTime,
      refresh: async () => {
        refreshes += 1;
        return {
          status: "complete" as const,
          sources: [],
          candidateCount: 10,
          enoughCandidates: true,
        };
      },
      generate: async ({ lease }: { lease?: PipelineLease } = {}) => {
        assert.ok(lease);
        generations += 1;
        const retryIssue = await db!.issue.findUniqueOrThrow({
          where: { editionDate: editionDateForNow(retryTime) },
        });
        await db!.issue.update({
          where: { id: retryIssue.id },
          data: {
            generationStatus: generations === 1 ? "failed" : "ready",
            generationError: generations === 1 ? "novelty_review_failed" : null,
            updatedAt: retryTime,
          },
        });
        return generations === 1
          ? {
              status: "failed" as const,
              issueId: retryIssue.id,
              code: "novelty_review_failed",
              keptPreviousDraft: false,
            }
          : {
              status: "ready" as const,
              issueId: retryIssue.id,
              storyCount: 10,
            };
      },
    };
    assert.equal(
      (await runPipeline("prepare", retryDependencies)).state,
      "retry_scheduled",
    );
    retryTime = new Date("2099-12-12T03:35:00Z");
    assert.equal(
      (await runPipeline("prepare", retryDependencies)).state,
      "retry_scheduled",
    );
    assert.equal(refreshes, 1);
    assert.equal(generations, 1);
    retryTime = new Date("2099-12-12T03:40:00Z");
    assert.equal(
      (await runPipeline("prepare", retryDependencies)).state,
      "waiting_for_approval",
    );
    assert.equal(refreshes, 2);
    assert.equal(generations, 2);
    assert.equal(
      (await runPipeline("prepare", retryDependencies)).state,
      "waiting_for_approval",
    );
    assert.equal(generations, 2);
    const recovered = await db.issue.findUniqueOrThrow({
      where: { editionDate: editionDateForNow(retryTime) },
    });
    assert.equal(recovered.scheduledGenerationAttempts, 2);
    assert.equal(recovered.publishedAt, null);
    let cappedTime = new Date("2099-12-07T03:30:00Z");
    let cappedRefreshes = 0;
    const cappedDependencies = {
      now: () => cappedTime,
      refresh: async () => {
        cappedRefreshes += 1;
        return {
          status: "complete" as const,
          sources: [],
          candidateCount: 0,
          enoughCandidates: false,
        };
      },
      generate: async () => {
        throw new Error("Insufficient sources must not generate");
      },
    };
    for (const [time, state] of [
      ["2099-12-07T03:30:00Z", "retry_scheduled"],
      ["2099-12-07T03:40:00Z", "retry_scheduled"],
      ["2099-12-07T03:50:00Z", "needs_review"],
      ["2099-12-07T04:00:00Z", "needs_review"],
    ]) {
      cappedTime = new Date(time);
      assert.equal(
        (await runPipeline("prepare", cappedDependencies)).state,
        state,
      );
    }
    assert.equal(cappedRefreshes, 3);
    process.env.PIPELINE_ENABLED = "false";
    const afternoon = new Date("2099-12-13T15:17:00Z");
    const manualDependencies = {
      now: () => afternoon,
      refresh: async () => ({
        status: "complete" as const,
        sources: [],
        candidateCount: 10,
        enoughCandidates: true,
      }),
    };
    assert.equal(
      (
        await prepareManualDraft({
          ...manualDependencies,
          refresh: async () => ({
            status: "complete",
            sources: [],
            candidateCount: 0,
            enoughCandidates: false,
          }),
          generate: async () => {
            throw new Error("Insufficient candidates must not generate");
          },
        })
      ).state,
      "insufficient_candidates",
    );
    assert.equal(
      (
        await prepareManualDraft({
          ...manualDependencies,
          generate: async () => ({
            status: "failed",
            issueId: attempted.id,
            code: "fixture",
            keptPreviousDraft: false,
          }),
        })
      ).state,
      "generation_failed",
    );
    const manual = await prepareManualDraft({
      ...manualDependencies,
      generate: async ({ lease } = {}) => {
        assert.ok(lease);
        await db!.issue.update({
          where: { id: attempted.id },
          data: { generationStatus: "ready", content: fixture.issue.content },
        });
        return { status: "ready", issueId: attempted.id, storyCount: 5 };
      },
    });
    assert.deepEqual(manual, { state: "ready", issueId: attempted.id });
    assert.equal(
      (await db.issue.findUniqueOrThrow({ where: { id: attempted.id } }))
        .scheduledGenerationAttempts,
      1,
    );
    assert.equal(
      (await db.issue.findUniqueOrThrow({ where: { id: attempted.id } }))
        .publishedAt,
      null,
    );
    assert.equal(
      (
        await prepareManualDraft({
          now: () => afternoon,
          refresh: async () => {
            throw new Error("Ready manual draft must not be replaced");
          },
        })
      ).state,
      "already_ready",
    );
    const manualLease = await acquirePipelineLease();
    assert.ok(manualLease);
    try {
      assert.equal(
        (await prepareManualDraft(manualDependencies)).state,
        "busy",
      );
    } finally {
      await releasePipelineLease(manualLease);
    }
    const previousDeployment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    assert.equal(
      (await prepareManualDraft(manualDependencies)).state,
      "disabled",
    );
    if (previousDeployment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousDeployment;
    process.env.PIPELINE_ENABLED = "true";
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
        editionNumber: 1,
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
        editionNumber: 2,
        content: fixture.issue.content,
        publishedAt: new Date(),
      },
    });
    assert.equal(
      (
        await prepareManualDraft({
          now: () => new Date("2099-12-11T15:00:00Z"),
          refresh: async () => {
            throw new Error("Published issue must not be refreshed");
          },
        })
      ).state,
      "published",
    );
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
        editionNumber: 3,
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
    await db.issue.update({
      where: { id: freshIssue.id },
      data: { deliveryFinishedAt: readyDay },
    });
    process.env.AUTO_PUBLISH_ENABLED = "true";
    process.env.PUBLIC_LAUNCH_APPROVED = "true";
    process.env.EMAIL_DELIVERY_ENABLED = "true";
    Object.assign(process.env, fixture.settings);
    process.env.SUBSCRIBER_LINK_SECRET = randomBytes(32).toString("base64url");
    process.env.CONSENT_VERSION = "fixture";
    stage = "automatic publication fixtures";
    const autoMorning = new Date("2099-12-15T04:00:00Z");
    const autoSource = await db.source.create({
      data: { key: "hackernews", enabled: true },
    });
    const autoIssue = await db.issue.create({
      data: { editionDate: editionDateForNow(autoMorning) },
    });
    const autoIds: number[] = [];
    const baseDraft = draftFixture(autoMorning);
    for (const candidate of baseDraft.pool) {
      const row = await db.rawItem.create({
        data: {
          sourceId: autoSource.id,
          externalId: randomUUID(),
          title: candidate.title,
          originalUrl: candidate.originalUrl,
          normalizedUrl: candidate.normalizedUrl,
          excerpt: candidate.sourceText,
          publishedAt: autoMorning,
          fetchedAt: autoMorning,
          tags: candidate.tags,
        },
      });
      autoIds.push(row.id);
    }
    const autoDraft = draftFixture(autoMorning, autoIds);
    for (const candidate of autoDraft.pool)
      await db.rawItem.update({
        where: { id: candidate.rawItemId },
        data: {
          originalUrl: candidate.originalUrl,
          normalizedUrl: candidate.normalizedUrl,
        },
      });
    await db.$transaction((tx) =>
      saveReadyDraft(
        tx,
        autoIssue.id,
        {
          draft: validateModelDraft(autoDraft.output, autoDraft.pool),
          model: "fixture-model",
          attempts: [],
        },
        autoDraft.pool,
        autoMorning,
      ),
    );
    stage = "automatic publication guards";
    assert.equal(
      (
        await runPipeline("delivery", {
          now: () => new Date("2099-12-15T03:59:59Z"),
          deliver: async () => {
            throw new Error("Automatic delivery must not start before 07:00");
          },
        })
      ).state,
      "outside_window",
    );
    const refused = (code: string) => (error: unknown) =>
      error instanceof PublicationError && error.code === code;
    const rejectAutoPublication = (time: Date, code: string) =>
      assert.rejects(
        db!.$transaction((tx) =>
          publishAutomaticDraftInTransaction(tx, autoIssue.id, time),
        ),
        refused(code),
      );
    await rejectAutoPublication(
      new Date("2099-12-15T03:59:59Z"),
      "automatic_window_closed",
    );
    await rejectAutoPublication(
      new Date("2099-12-15T08:00:00Z"),
      "automatic_window_closed",
    );
    await rejectAutoPublication(
      new Date("2099-12-16T04:00:00Z"),
      "automatic_edition_mismatch",
    );
    await db.source.update({
      where: { id: autoSource.id },
      data: { enabled: false },
    });
    await rejectAutoPublication(autoMorning, "source_disabled");
    await db.source.update({
      where: { id: autoSource.id },
      data: { enabled: true },
    });
    await db.rawItem.update({
      where: { id: autoIds[0] },
      data: { excerpt: "Missing source evidence." },
    });
    await rejectAutoPublication(autoMorning, "invalid_evidence");
    await db.rawItem.update({
      where: { id: autoIds[0] },
      data: { excerpt: autoDraft.pool[0].sourceText },
    });
    await db.issue.update({
      where: { id: autoIssue.id },
      data: { generationError: "failed_regeneration" },
    });
    await rejectAutoPublication(autoMorning, "invalid_content");
    await db.issue.update({
      where: { id: autoIssue.id },
      data: { generationError: null },
    });
    assert.equal(
      (
        await runPipeline("prepare", {
          now: () => new Date("2099-12-15T03:30:00Z"),
          refresh: async () => {
            throw new Error("Prepared editions must not be generated again");
          },
        })
      ).state,
      "prepared",
    );
    stage = "automatic delivery queue";
    const queuedDelivery: typeof import("../lib/server/delivery/send").runDelivery =
      async (request, lease) => {
        assert.deepEqual(request, { mode: "issue", issueId: autoIssue.id });
        assert.ok(lease);
        const sendId = randomUUID();
        await commitUnderPipelineLease(lease, (tx) =>
          saveDeliverySnapshot(tx, autoIssue.id, new Date(), [
            {
              id: sendId,
              subscriberId: reviewSubscriber.id,
              subscriptionVersion: 1,
              language: "en",
              message: {
                idempotencyKey: `issue/${sendId}`,
                payload: {
                  from: fixture.settings.EMAIL_FROM,
                  to: [reviewSubscriber.email],
                  reply_to: fixture.settings.EMAIL_REPLY_TO,
                  subject: "Automatic edition fixture",
                  html: "<p>Automatic edition fixture</p>",
                  text: "Automatic edition fixture",
                  tags: [
                    { name: "send_id", value: sendId },
                    { name: "kind", value: "issue" },
                  ],
                },
              },
            },
          ]),
        );
        return { state: "progress", attempted: 0 };
      };
    let cacheRefreshes = 0;
    const autoDependencies = {
      now: () => autoMorning,
      deliver: queuedDelivery,
      refreshCache: (key: string) => {
        assert.equal(key, "2099-12-15");
        cacheRefreshes += 1;
      },
    };
    process.env.PUBLIC_LAUNCH_APPROVED = "false";
    assert.equal(
      (await runPipeline("delivery", autoDependencies)).state,
      "needs_review",
    );
    process.env.PUBLIC_LAUNCH_APPROVED = "true";
    const failedCache = await runPipeline("delivery", {
      ...autoDependencies,
      refreshCache: () => {
        throw new Error("Simulated cache refresh failure");
      },
      deliver: async () => {
        throw new Error("Delivery must wait for cache refresh");
      },
    });
    assert.equal(failedCache.state, "cache_refresh_pending");
    assert.equal(
      await db.sendLog.count({ where: { issueId: autoIssue.id } }),
      0,
    );
    await runPipeline("delivery", autoDependencies);
    const autoPublished = await db.issue.findUniqueOrThrow({
      where: { id: autoIssue.id },
    });
    assert.equal(
      autoPublished.publishedAt?.toISOString(),
      autoMorning.toISOString(),
    );
    assert.equal(
      await db.sendLog.count({ where: { issueId: autoIssue.id } }),
      1,
    );
    await runPipeline("delivery", autoDependencies);
    assert.equal(
      await db.sendLog.count({ where: { issueId: autoIssue.id } }),
      1,
    );
    assert.equal(
      (await db.issue.findUniqueOrThrow({ where: { id: autoIssue.id } }))
        .editionNumber,
      autoPublished.editionNumber,
    );
    assert.equal(cacheRefreshes, 2);
    process.env.VERCEL_ENV = "preview";
    assert.equal(
      (await runPipeline("delivery", autoDependencies)).state,
      "disabled",
    );
    delete process.env.VERCEL_ENV;
    process.env.AUTO_PUBLISH_ENABLED = "false";
    stage = "HTTP checks";
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
          AUTO_PUBLISH_ENABLED: "false",
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
    const workspace = await fetch(`${base}/admin`, { headers: { cookie } });
    assert.equal(workspace.status, 200);
    const workspaceHtml = await workspace.text();
    assert.match(workspaceHtml, /morning-heading/);
    assert.match(workspaceHtml, /Recipient list captured/);
    assert.match(workspaceHtml, /Recipients \/ accepted \/ delivered events/);
    const preview = await fetch(`${base}/admin/operations`, {
      headers: { cookie },
    });
    assert.equal(preview.status, 200);
    assert.match(await preview.text(), /Retention and cleanup/);
    const todayDraft = await db.issue.findUniqueOrThrow({
      where: { editionDate: editionDateForNow() },
    });
    const manualRequest = (authorized: boolean) =>
      fetch(`${base}/api/admin/operations`, {
        method: "POST",
        redirect: "manual",
        headers: { origin: admin.SITE_URL, ...(authorized ? { cookie } : {}) },
        body: new URLSearchParams({ mode: "prepare" }),
      });
    assert.equal((await manualRequest(false)).status, 401);
    const openedDraft = await manualRequest(true);
    assert.equal(openedDraft.status, 303);
    const openedUrl = new URL(openedDraft.headers.get("location")!);
    assert.equal(openedUrl.pathname, `/admin/issues/${todayDraft.id}`);
    assert.equal(openedUrl.searchParams.get("notice"), "draft_already_ready");
    assert.deepEqual(
      (await db.issue.findUniqueOrThrow({ where: { id: todayDraft.id } }))
        .content,
      todayDraft.content,
    );
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
      "Production migrations deployed twice with no schema drift; isolated morning timing, automatic validation/publication, cache recovery, queue idempotency, preview/launch guards, manual approval, cron auth and cleanup HTTP checks passed; no external provider calls",
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
  else {
    let detail = error instanceof Error ? error.message : "Unknown error";
    for (const [key, value] of Object.entries(process.env))
      if (/(SECRET|KEY|PASSWORD|DATABASE_URL)/.test(key) && value)
        detail = detail.replaceAll(value, "[redacted]");
    console.error(`Isolated operations check failed at ${stage}: ${detail}`);
  }
  process.exitCode = 1;
});
