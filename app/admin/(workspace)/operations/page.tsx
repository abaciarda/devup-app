import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/server/admin/auth";
import { getDb } from "@/lib/server/database/client";
import {
  cleanupInTransaction,
  retentionDays,
} from "@/lib/server/operations/cleanup";
import {
  Badge,
  PageHeading,
  LoadingPanel,
} from "@/components/admin/presentation";

export const instant = false;
const countNames: Record<string, string> = {
  counters: "Expired rate-limit counters",
  unusedSources: "Unused source records",
  expiredConfirmations: "Expired confirmation payloads",
  emailPayloads: "Completed email payloads",
  unattemptedPending: "Expired pending signups",
};
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
    <section className="admin-stack">
      <Link href="/admin" prefetch={false} className="admin-link">
        <span aria-hidden="true">← </span>Back to workspace
      </Link>
      <PageHeading
        eyebrow="Workspace operations"
        title="Retention and cleanup"
        description="Review eligible records before applying a cleanup batch. This page is a preview; opening it does not delete data."
        action={<Badge tone="blue">Preview only</Badge>}
      />
      {query.state && notices[query.state] && (
        <p role="status" className="admin-notice">
          {notices[query.state]}
        </p>
      )}
      {(preview.limited || query.limited === "true") && (
        <p className="admin-warning">
          More work may remain after the bounded batch. Review and repeat
          cleanup.
        </p>
      )}
      <section className="admin-card">
        <div className="admin-card-header">
          <div>
            <h2>Eligible records</h2>
            <p>Counts are limited to the next bounded batch.</p>
          </div>
        </div>
        <ul className="admin-card-body admin-checks">
          {Object.entries(preview.counts).map(([key, count]) => (
            <li key={key}>
              <span>{countNames[key] ?? key}</span>
              <Badge>{count} eligible</Badge>
            </li>
          ))}
        </ul>
      </section>
      <section className="admin-card admin-card-body admin-stack">
        <h2>Retention policy</h2>
        <p className="admin-description">
          Remove unused source records older than {retentionDays.unusedSources}{" "}
          days and never-attempted expired pending signups older than{" "}
          {retentionDays.unattemptedPending} days. Clear safe expired
          confirmation payloads after {retentionDays.expiredConfirmation} days;
          redact terminal issue payloads after {retentionDays.emailPayloads}{" "}
          days. Expired counters have a one-day safety margin.
        </p>
        <p className="admin-help">
          Unknown/retryable/review work, renewed tokens, published source
          evidence, subscriber permission/suppression records and minimal
          correlation history are preserved. This is a technical retention
          policy; operator handling of personal-data requests, hosting logs and
          backups is still required.
        </p>
        <form
          action="/api/admin/operations"
          method="post"
          className="space-y-4"
        >
          <input type="hidden" name="mode" value="apply_cleanup" />
          <label className="admin-checkbox">
            <input
              type="checkbox"
              name="reviewedRetention"
              value="yes"
              required
            />
            I reviewed these counts and the retention policy.
          </label>
          <button type="submit" className="admin-button admin-button-primary">
            Apply cleanup when enabled
          </button>
        </form>
      </section>
    </section>
  );
}
export default function OperationsPage(props: {
  searchParams: Promise<{ state?: string; limited?: string }>;
}) {
  return (
    <Suspense
      fallback={<LoadingPanel>Loading private cleanup preview…</LoadingPanel>}
    >
      <CleanupWorkspace {...props} />
    </Suspense>
  );
}
