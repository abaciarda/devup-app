import { pathToFileURL } from "node:url";

export async function runScheduled(
  mode,
  {
    siteUrl,
    secret,
    transport = fetch,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  if (!["prepare", "delivery", "confirmations", "cleanup"].includes(mode))
    throw new Error("Invalid scheduled mode");
  const url = new URL(siteUrl);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[A-Za-z0-9_-]{43}$/.test(secret ?? "")
  )
    throw new Error("Invalid scheduler settings");
  const endpoint = new URL(
    mode === "cleanup" ? "/api/pipeline/cleanup" : "/api/pipeline/run",
    url,
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await transport(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(mode === "cleanup" ? 70_000 : 330_000),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: mode === "cleanup" ? "" : new URLSearchParams({ mode }).toString(),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Scheduled request failed");
    }
    const result = await response.json();
    if (
      !result ||
      ![
        "disabled",
        "busy",
        "outside_window",
        "published",
        "delivery_pending",
        "waiting_for_approval",
        "needs_review",
        "progress",
        "retry_scheduled",
        "provider_backoff",
        "daily_limit",
        "complete",
      ].includes(result.state)
    )
      throw new Error("Invalid scheduler response");
    if (result.state === "busy" && attempt < 2) {
      await pause(5000 * 2 ** attempt);
      continue;
    }
    if (
      result.state === "busy" ||
      result.state === "needs_review" ||
      result.state === "disabled" ||
      result.limited === true
    )
      throw new Error(`Scheduled work requires attention: ${result.state}`);
    return {
      state: result.state,
      ...(Number.isInteger(result.attempted)
        ? { attempted: result.attempted }
        : {}),
    };
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runScheduled(process.argv[2], {
    siteUrl: process.env.SITE_URL,
    secret: process.env.CRON_SECRET,
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error(
        "Scheduled operation failed or needs review; check the private admin workspace and workflow settings",
      );
      process.exitCode = 1;
    });
}
