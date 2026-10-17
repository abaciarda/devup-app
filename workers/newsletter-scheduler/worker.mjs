import { runScheduled } from "../../scripts/lib/scheduled-request.mjs";

export function scheduledModes(cron, scheduledTime) {
  if (cron === "15 5 * * *") return ["health"];
  if (cron !== "*/5 * * * *") throw new Error("Unknown newsletter schedule");
  const date = new Date(scheduledTime);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid schedule time");
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  const modes = [];
  if (minute >= 210 && minute < 480) modes.push("prepare");
  if ((minute >= 240 && minute < 480) || date.getUTCMinutes() === 0)
    modes.push("delivery");
  modes.push("confirmations");
  return modes;
}

export async function runTick(controller, env, options = {}) {
  if (env.SCHEDULER_ENABLED !== "true") return;
  const now = options.now ?? Date.now();
  if (
    !Number.isFinite(controller.scheduledTime) ||
    now - controller.scheduledTime > 600_000 ||
    controller.scheduledTime - now > 60_000
  )
    throw new Error("Newsletter schedule is stale");
  if (env.SITE_URL !== "https://devup.ardaabaci.com")
    throw new Error("Invalid newsletter destination");
  const modes = scheduledModes(controller.cron, controller.scheduledTime);
  const secret = env.CRON_SECRET?.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret ?? ""))
    throw new Error("Invalid newsletter secret format");
  const failures = [];
  const request = options.request ?? runScheduled;
  const log = options.log ?? console.log;
  for (const mode of modes) {
    try {
      const config = {
        siteUrl: env.SITE_URL,
        secret,
      };
      const result = await request(mode, config);
      log(JSON.stringify({ mode, ...result }));
      if (mode === "delivery" && result.state === "published") {
        const delivery = await request(mode, config);
        log(JSON.stringify({ mode, ...delivery }));
      }
    } catch (error) {
      failures.push(mode);
      const reason =
        error instanceof TypeError
          ? "runtime_or_transport"
          : error instanceof ReferenceError
            ? "missing_runtime_api"
            : error instanceof Error &&
                error.message === "Scheduled request failed"
              ? "http_error"
              : "operation_requires_review";
      log(JSON.stringify({ mode, state: "failed_or_needs_review", reason }));
    }
  }
  if (failures.length)
    throw new Error(`Newsletter requires attention: ${failures.join(", ")}`);
}

const worker = {
  async scheduled(controller, env) {
    await runTick(controller, env);
  },
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
