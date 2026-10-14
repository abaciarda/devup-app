import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { inPreparationWindow } from "../lib/server/operations/pipeline";
import { operationsEnvSchema } from "../lib/server/operations/env";
import { authorizeScheduledRequest } from "../lib/server/operations/http";
import { subscriptionEnv } from "../lib/server/subscriptions/env";
import { deliveryEnv } from "../lib/server/delivery/env";
import { runScheduled } from "./run-scheduled.mjs";

async function main() {
  const secret = randomBytes(32).toString("base64url");
  const defaults = operationsEnvSchema.parse({ CRON_SECRET: secret });
  assert.equal(defaults.PIPELINE_ENABLED, "false");
  assert.equal(defaults.CLEANUP_ENABLED, "false");
  for (const [time, expected] of [
    ["2026-10-14T03:59:00Z", false],
    ["2026-10-14T04:00:00Z", true],
    ["2026-10-14T07:59:00Z", true],
    ["2026-10-14T08:00:00Z", false],
  ] as const)
    assert.equal(inPreparationWindow(new Date(time)), expected);
  process.env.CRON_SECRET = secret;
  assert.equal(
    authorizeScheduledRequest(new Request("https://devup.example"))?.status,
    401,
  );
  assert.equal(
    authorizeScheduledRequest(
      new Request("https://devup.example", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    ),
    null,
  );
  process.env.SITE_URL = "https://devup.example";
  process.env.SUBSCRIBER_LINK_SECRET = randomBytes(32).toString("base64url");
  process.env.CONSENT_VERSION = "fixture";
  process.env.SUBSCRIPTIONS_ENABLED = "true";
  process.env.EMAIL_DELIVERY_ENABLED = "true";
  process.env.RESEND_API_KEY = "re_fixture";
  process.env.PUBLIC_LAUNCH_APPROVED = "true";
  process.env.VERCEL_ENV = "preview";
  assert.equal(subscriptionEnv().SUBSCRIPTIONS_ENABLED, "false");
  assert.equal(deliveryEnv().EMAIL_DELIVERY_ENABLED, "false");
  delete process.env.VERCEL_ENV;
  const original = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.PUBLIC_LAUNCH_APPROVED = "false";
  assert.equal(subscriptionEnv().SUBSCRIPTIONS_ENABLED, "false");
  Object.assign(process.env, { NODE_ENV: original ?? "development" });
  const seen: string[] = [];
  let requests = 0;
  const transport: typeof fetch = async (url, init) => {
    seen.push(String(url));
    assert.equal(init?.redirect, "error");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      `Bearer ${secret}`,
    );
    return Response.json({
      state: requests++ ? "waiting_for_approval" : "busy",
    });
  };
  assert.deepEqual(
    await runScheduled("prepare", {
      siteUrl: "https://devup.example",
      secret,
      transport,
      pause: async () => {},
    }),
    { state: "waiting_for_approval" },
  );
  assert.equal(seen.length, 2);
  await assert.rejects(
    runScheduled("prepare", {
      siteUrl: "http://devup.example",
      secret,
      transport,
    }),
  );
  await assert.rejects(
    runScheduled("delivery", {
      siteUrl: "https://devup.example",
      secret,
      transport: async () => Response.json({ state: "needs_review" }),
    }),
  );
  await assert.rejects(
    runScheduled("cleanup", {
      siteUrl: "https://devup.example",
      secret,
      transport: async () =>
        Response.json({ state: "complete", limited: true }),
    }),
  );
  console.log(
    "Istanbul schedule window, disabled defaults, bearer auth, preview/launch guards, bounded scheduler retries and attention reporting passed",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
