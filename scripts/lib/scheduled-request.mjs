export async function runScheduled(
  mode,
  {
    siteUrl,
    secret,
    transport = fetch,
    pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  if (
    !["prepare", "delivery", "confirmations", "cleanup", "health"].includes(
      mode,
    )
  )
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
    mode === "cleanup"
      ? "/api/pipeline/cleanup"
      : mode === "health"
        ? "/api/pipeline/health"
        : "/api/pipeline/run",
    url,
  );
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await transport(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(
        mode === "health" ? 40_000 : mode === "cleanup" ? 70_000 : 330_000,
      ),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body:
        mode === "cleanup" || mode === "health"
          ? ""
          : new URLSearchParams({ mode }).toString(),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Scheduled request failed");
    }
    const result = await response.json();
    if (mode === "health") {
      const codes = new Set([
        "pipeline_disabled",
        "automatic_publication_disabled",
        "email_sending_disabled",
        "missing_edition",
        "draft_needs_review",
        "edition_not_published",
        "sending_not_started",
        "delivery_needs_review",
        "delivery_incomplete",
      ]);
      if (
        !result ||
        !["healthy", "attention", "disabled"].includes(result.state) ||
        !Array.isArray(result.problems) ||
        result.problems.length > codes.size ||
        result.problems.some((code) => !codes.has(code)) ||
        (result.state === "healthy" && result.problems.length !== 0) ||
        (result.state === "attention" && result.problems.length === 0)
      )
        throw new Error("Invalid health response");
      if (result.state !== "healthy")
        throw new ScheduledAttentionError(
          `Daily newsletter health requires attention: ${result.state === "disabled" ? "disabled" : result.problems.join(", ")}`,
        );
      return { state: "healthy" };
    }
    if (
      !result ||
      ![
        "disabled",
        "busy",
        "outside_window",
        "published",
        "delivery_pending",
        "waiting_for_approval",
        "prepared",
        "cache_refresh_pending",
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
      result.state === "cache_refresh_pending" ||
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
export class ScheduledAttentionError extends Error {}
