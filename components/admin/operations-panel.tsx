import { requireAdmin } from "@/lib/server/admin-auth";
import { getDb } from "@/lib/server/db";
import { launchReadiness } from "@/lib/server/launch-readiness";
import Link from "next/link";

export default async function OperationsPanel() {
  await requireAdmin();
  const report = launchReadiness();
  const cleanup = await getDb().cleanupRun.findFirst({
    orderBy: { date: "desc" },
    select: { date: true, finishedAt: true },
  });
  return (
    <section className="space-y-4 rounded-xl border border-line p-5">
      <h2 className="text-xl font-semibold">Operations and launch checks</h2>
      <p>
        Configuration checks do not prove inbox delivery or deployment
        readiness. Public launch still requires the operator checklist.
      </p>
      <ul>
        {Object.entries(report.checks).map(([key, valid]) => (
          <li key={key}>
            {key}: {valid ? "Configured" : "Needs setup"}
          </li>
        ))}
      </ul>
      <p>
        {cleanup?.finishedAt
          ? `Latest cleanup batch: ${cleanup.finishedAt.toISOString()}`
          : "No completed cleanup yet."}
      </p>
      <div className="flex flex-wrap gap-3">
        {(["prepare", "preview_cleanup"] as const).map((mode) => (
          <form key={mode} action="/api/admin/operations" method="post">
            <input type="hidden" name="mode" value={mode} />
            <button
              className="rounded-lg border border-line px-4 py-2"
              type="submit"
            >
              {mode === "prepare"
                ? "Prepare today's draft"
                : mode === "preview_cleanup"
                  ? "Preview cleanup counts"
                  : "Apply enabled cleanup"}
            </button>
          </form>
        ))}
      </div>
      <Link href="/admin/operations" prefetch={false} className="underline">
        Review retention and cleanup counts
      </Link>
      <p className="text-sm">
        Preparation runs only between 07:00 and 11:00 in Europe/Istanbul and
        never publishes. Cleanup must be explicitly enabled; preview does not
        delete or redact data.
      </p>
    </section>
  );
}
