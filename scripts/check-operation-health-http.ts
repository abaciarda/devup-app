import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

async function main() {
  const secret = randomBytes(32).toString("base64url");
  const base = "http://127.0.0.1:3420";
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3420",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        CRON_SECRET: secret,
        SITE_URL: "https://devup.example",
        PIPELINE_ENABLED: "false",
        AUTO_PUBLISH_ENABLED: "false",
        EMAIL_DELIVERY_ENABLED: "false",
        CLEANUP_ENABLED: "false",
        RESEND_API_KEY: "re_fixture",
        GEMINI_API_KEY: "fixture",
      },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (server.exitCode !== null)
        throw new Error("Health test server stopped");
      try {
        const response = await fetch(`${base}/api/pipeline/health`, {
          method: "POST",
          signal: AbortSignal.timeout(2000),
        });
        if (response.status === 401) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready);
    assert.equal(
      (
        await fetch(`${base}/api/pipeline/health`, {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        })
      ).status,
      401,
    );
    const response = await fetch(`${base}/api/pipeline/health`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const report = await response.json();
    assert.deepEqual(Object.keys(report).sort(), ["problems", "state"]);
    assert.ok(["healthy", "attention"].includes(report.state));
    assert.ok(Array.isArray(report.problems));
    assert.ok(!JSON.stringify(report).includes("@"));
    console.log(
      "Production health HTTP passed: missing/wrong bearer rejected, authorized read-only report rendered without private fields, response uncached, no email or mutation triggered",
    );
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
