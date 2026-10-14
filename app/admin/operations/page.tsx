import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getDb } from "@/lib/server/db";
import { cleanupInTransaction, retentionDays } from "@/lib/server/cleanup";

export const instant = false;
async function CleanupWorkspace({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; limited?: string }>;
}) {
  await requireAdmin();
  const preview = await getDb().$transaction((tx) => cleanupInTransaction(tx), {
    maxWait: 5000,
    timeout: 10000,
  });
  const query = await searchParams;
  const notices: Record<string, string> = {
    complete: "Cleanup batch completed. Remaining candidates are shown below.",
    preview: "Preview only. No data was deleted or redacted.",
    disabled:
      "Cleanup is disabled in configuration or this preview deployment.",
    busy: "Another pipeline operation is running. Try again later.",
  };
  return (
    <section className="space-y-6">
      <Link href="/admin" prefetch={false} className="underline">
        Back to workspace
      </Link>
      <h1 className="text-2xl font-semibold">Retention and cleanup</h1>
      {query.state && notices[query.state] && (
        <p role="status">{notices[query.state]}</p>
      )}
      {(preview.limited || query.limited === "true") && (
        <p>
          More work may remain after the bounded batch. Review and repeat
          cleanup.
        </p>
      )}
      <ul>
        {Object.entries(preview.counts).map(([key, count]) => (
          <li key={key}>
            {key}: {count} eligible in this batch
          </li>
        ))}
      </ul>
      <p>
        Remove unused source records older than {retentionDays.unusedSources}{" "}
        days and never-attempted expired pending signups older than{" "}
        {retentionDays.unattemptedPending} days. Clear safe expired confirmation
        payloads after {retentionDays.expiredConfirmation} days; redact terminal
        issue payloads after {retentionDays.emailPayloads} days. Expired
        counters have a one-day safety margin.
      </p>
      <p>
        Unknown/retryable/review work, renewed tokens, published source
        evidence, subscriber permission/suppression records and minimal
        correlation history are preserved. This is a technical retention policy;
        operator handling of personal-data requests, hosting logs and backups is
        still required.
      </p>
      <form action="/api/admin/operations" method="post" className="space-y-4">
        <input type="hidden" name="mode" value="apply_cleanup" />
        <label className="flex gap-3">
          <input
            type="checkbox"
            name="reviewedRetention"
            value="yes"
            required
          />
          I reviewed these counts and the retention policy.
        </label>
        <button
          type="submit"
          className="rounded-lg border border-line px-4 py-2"
        >
          Apply cleanup when enabled
        </button>
      </form>
    </section>
  );
}
export default function OperationsPage(props: {
  searchParams: Promise<{ state?: string; limited?: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading private cleanup preview…</p>}>
      <CleanupWorkspace {...props} />
    </Suspense>
  );
}
