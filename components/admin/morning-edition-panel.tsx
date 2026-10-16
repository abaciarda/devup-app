import Link from "next/link";
import { editionDateForNow, editionDateKey } from "@/lib/edition-date";
import { requireAdmin } from "@/lib/server/admin/auth";
import { getDb } from "@/lib/server/database/client";
import { morningStatus } from "@/lib/server/operations/morning-status";
import { Badge } from "./presentation";

function time(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Istanbul",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(value)
    : "Not yet";
}

export default async function MorningEditionPanel() {
  await requireAdmin();
  const now = new Date();
  const db = getDb();
  const issue = await db.issue.findUnique({
    where: { editionDate: editionDateForNow(now) },
    select: {
      id: true,
      generationStatus: true,
      generationError: true,
      publishedAt: true,
      deliveryStartedAt: true,
      deliveryFinishedAt: true,
    },
  });
  const rows = issue
    ? await db.sendLog.groupBy({
        by: ["status", "needsReview"],
        where: { issueId: issue.id },
        _count: { _all: true, deliveredAt: true },
      })
    : [];
  const counts = {
    recipients: 0,
    accepted: 0,
    delivered: 0,
    pending: 0,
    failed: 0,
    unknown: 0,
    suppressed: 0,
    needsReview: 0,
  };
  for (const row of rows) {
    counts.recipients += row._count._all;
    counts[row.status] += row._count._all;
    counts.delivered += row._count.deliveredAt;
    if (row.needsReview) counts.needsReview += row._count._all;
  }
  const status = morningStatus(issue, counts, now);

  return (
    <section className="admin-card" aria-labelledby="morning-heading">
      <div className="admin-card-header">
        <div>
          <h2 id="morning-heading">Today&apos;s morning edition</h2>
          <p>{editionDateKey(now)} · All times Europe/Istanbul</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div className="admin-card-body admin-stack">
        <p>{status.description}</p>
        <ul className="admin-checks">
          <li>
            <span>Website published</span>
            <span>{time(issue?.publishedAt)}</span>
          </li>
          <li>
            <span>Recipient list captured</span>
            <span>{time(issue?.deliveryStartedAt)}</span>
          </li>
          <li>
            <span>Sending finished</span>
            <span>{time(issue?.deliveryFinishedAt)}</span>
          </li>
          <li>
            <span>Recipients / accepted / delivered events</span>
            <span>
              {counts.recipients} / {counts.accepted} / {counts.delivered}
            </span>
          </li>
        </ul>
        <p className="admin-help">
          Failed: {counts.failed} · Uncertain: {counts.unknown} · Suppressed:{" "}
          {counts.suppressed} · Pending: {counts.pending}. This is a snapshot
          when the page loads; refresh to check progress. Provider delivery
          events do not prove the message reached the inbox folder.
        </p>
        {issue && (
          <Link
            href={`/admin/issues/${issue.id}`}
            prefetch={false}
            className="admin-link"
          >
            Review today&apos;s edition →
          </Link>
        )}
      </div>
    </section>
  );
}
