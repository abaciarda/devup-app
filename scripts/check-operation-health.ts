import assert from "node:assert/strict";
import { evaluateDailyHealth } from "../lib/server/operations/health-status";
import { runScheduled } from "./run-scheduled.mjs";

async function main() {
  const healthy = {
    now: new Date("2026-10-16T05:23:00Z"),
    issue: {
      generationStatus: "ready",
      generationError: null,
      publishedAt: new Date("2026-10-15T21:05:00Z"),
      deliveryStartedAt: new Date("2026-10-15T21:10:00Z"),
      deliveryFinishedAt: new Date("2026-10-15T21:10:08Z"),
    },
    recipients: 2,
    accepted: 2,
    unresolved: 0,
    pipelineEnabled: true,
    autoPublishEnabled: true,
    deliveryEnabled: true,
  };
  assert.deepEqual(evaluateDailyHealth(healthy), {
    state: "healthy",
    problems: [],
  });
  assert.equal(
    evaluateDailyHealth({
      ...healthy,
      issue: null,
      now: new Date("2026-10-16T04:14:59Z"),
    }).state,
    "healthy",
  );
  assert.deepEqual(
    evaluateDailyHealth({
      ...healthy,
      issue: null,
      now: new Date("2026-10-16T04:15:00Z"),
    }).problems,
    ["missing_edition"],
  );
  assert.ok(
    evaluateDailyHealth({
      ...healthy,
      issue: { ...healthy.issue, publishedAt: null },
    }).problems.includes("edition_not_published"),
  );
  assert.ok(
    evaluateDailyHealth({
      ...healthy,
      issue: {
        ...healthy.issue,
        deliveryStartedAt: null,
        deliveryFinishedAt: null,
      },
    }).problems.includes("sending_not_started"),
  );
  assert.ok(
    evaluateDailyHealth({
      ...healthy,
      accepted: 1,
      unresolved: 1,
    }).problems.includes("delivery_needs_review"),
  );
  assert.ok(
    evaluateDailyHealth({
      ...healthy,
      issue: { ...healthy.issue, deliveryFinishedAt: null },
    }).problems.includes("delivery_incomplete"),
  );
  assert.ok(
    evaluateDailyHealth({
      ...healthy,
      pipelineEnabled: false,
      autoPublishEnabled: false,
      deliveryEnabled: false,
    }).problems.includes("email_sending_disabled"),
  );
  assert.equal(
    evaluateDailyHealth({ ...healthy, recipients: 0, accepted: 0 }).state,
    "healthy",
  );
  const config = { siteUrl: "https://devup.example", secret: "a".repeat(43) };
  assert.deepEqual(
    await runScheduled("health", {
      ...config,
      transport: async (url, init) => {
        assert.equal(String(url), "https://devup.example/api/pipeline/health");
        assert.equal(init?.method, "POST");
        assert.equal(init?.body, "");
        return Response.json({ state: "healthy", problems: [] });
      },
    }),
    { state: "healthy" },
  );
  await assert.rejects(
    runScheduled("health", {
      ...config,
      transport: async () =>
        Response.json({ state: "attention", problems: ["missing_edition"] }),
    }),
    /missing_edition/,
  );
  await assert.rejects(
    runScheduled("health", {
      ...config,
      transport: async () => Response.json({ state: "disabled", problems: [] }),
    }),
    /disabled/,
  );
  await assert.rejects(
    runScheduled("health", {
      ...config,
      transport: async () =>
        Response.json({
          state: "attention",
          problems: ["private untrusted text"],
        }),
    }),
    /Invalid health response/,
  );
  await assert.rejects(
    runScheduled("health", {
      ...config,
      transport: async () =>
        Response.json({ state: "healthy", problems: ["missing_edition"] }),
    }),
    /Invalid health response/,
  );
  await assert.rejects(
    runScheduled("health", {
      ...config,
      transport: async () => new Response("Unavailable", { status: 503 }),
    }),
    /Scheduled request failed/,
  );
  console.log(
    "Health checks passed: Istanbul grace boundary, missing/published-only/incomplete editions, review cases, disabled flags, healthy zero-recipient snapshots, authenticated caller URL, and safe problem-code validation",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
