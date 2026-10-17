import assert from "node:assert/strict";
import worker, {
  runTick,
  scheduledModes,
} from "../workers/newsletter-scheduler/worker.mjs";
import { runScheduled } from "./lib/scheduled-request.mjs";

const at = (time) => Date.parse(`2026-10-17T${time}:00Z`);
const modes = (time) => scheduledModes("*/5 * * * *", at(time));
assert.deepEqual(modes("03:25"), ["confirmations"]);
assert.deepEqual(modes("03:30"), ["prepare", "confirmations"]);
assert.deepEqual(modes("03:55"), ["prepare", "confirmations"]);
assert.deepEqual(modes("04:00"), ["prepare", "delivery", "confirmations"]);
assert.deepEqual(modes("07:55"), ["prepare", "delivery", "confirmations"]);
assert.deepEqual(modes("08:00"), ["delivery", "confirmations"]);
assert.deepEqual(modes("08:05"), ["confirmations"]);
assert.deepEqual(scheduledModes("15 5 * * *", at("05:15")), ["health"]);
assert.throws(() => scheduledModes("* * * * *", at("04:00")));

const env = {
  SCHEDULER_ENABLED: "true",
  SITE_URL: "https://devup.ardaabaci.com",
  CRON_SECRET: "a".repeat(43),
};
const event = { cron: "*/5 * * * *", scheduledTime: at("04:00") };
const calls = [];
const logs = [];
await assert.rejects(
  runTick(event, env, {
    now: at("04:00"),
    request: async (mode, config) => {
      assert.equal(config.secret, env.CRON_SECRET);
      calls.push(mode);
      if (mode === "prepare") throw new Error("Private provider failure");
      return { state: "complete", attempted: 0 };
    },
    log: (line) => logs.push(line),
  }),
  /requires attention: prepare/,
);
assert.deepEqual(calls, ["prepare", "delivery", "confirmations"]);
assert.ok(!logs.join("").includes(env.CRON_SECRET));
assert.ok(!logs.join("").includes("Private provider failure"));
const publicationCalls = [];
await runTick(event, env, {
  now: at("04:00"),
  request: async (mode) => {
    publicationCalls.push(mode);
    return {
      state:
        mode === "delivery" && publicationCalls.length === 2
          ? "published"
          : "complete",
    };
  },
  log: () => {},
});
assert.deepEqual(publicationCalls, [
  "prepare",
  "delivery",
  "delivery",
  "confirmations",
]);
await runTick(
  event,
  { ...env, CRON_SECRET: `${env.CRON_SECRET}\r\n` },
  {
    now: at("04:00"),
    request: async (_mode, config) => {
      assert.equal(config.secret, env.CRON_SECRET);
      return { state: "complete" };
    },
    log: () => {},
  },
);
await runTick(
  event,
  { ...env, SCHEDULER_ENABLED: "false" },
  {
    request: () => assert.fail("Disabled scheduler called the site"),
  },
);
await assert.rejects(runTick(event, env, { now: at("04:15") }), /stale/);
await assert.rejects(
  runTick(
    event,
    { ...env, SITE_URL: "https://other.example" },
    {
      now: at("04:00"),
    },
  ),
  /destination/,
);
assert.equal((await worker.fetch()).status, 404);
assert.deepEqual(
  await runScheduled("confirmations", {
    siteUrl: env.SITE_URL,
    secret: env.CRON_SECRET,
    transport: async (url, init) => {
      assert.equal(String(url), `${env.SITE_URL}/api/pipeline/run`);
      assert.equal(init.headers.Authorization, `Bearer ${env.CRON_SECRET}`);
      assert.equal(init.redirect, "manual");
      assert.equal(init.body, "mode=confirmations");
      return Response.json({ state: "complete", attempted: 0 });
    },
  }),
  { state: "complete", attempted: 0 },
);
let redirectRequests = 0;
await assert.rejects(
  runScheduled("confirmations", {
    siteUrl: env.SITE_URL,
    secret: env.CRON_SECRET,
    transport: async (_url, init) => {
      redirectRequests += 1;
      assert.equal(init.redirect, "manual");
      return new Response(null, {
        status: 307,
        headers: { Location: "https://other.example" },
      });
    },
  }),
  /Scheduled request failed/,
);
assert.equal(redirectRequests, 1);
console.log("Cloudflare scheduler checks passed");
