import { mutationNoticeText } from "@/lib/server/admin/mutations";
import { listAdminIssues, listAdminSources } from "@/lib/server/admin/preview";
import Link from "next/link";
import { Suspense } from "react";
import DeliveryPanel from "@/components/admin/delivery-panel";
import OperationsPanel from "@/components/admin/operations-panel";
import MorningEditionPanel from "@/components/admin/morning-edition-panel";
import {
  Badge,
  PageHeading,
  LoadingPanel,
  formatAdminDate,
} from "@/components/admin/presentation";

export const instant = false;
type Search = Promise<{ notice?: string | string[] }>;
const sourceNames: Record<string, string> = {
  devto: "DEV Community",
  hackernews: "Hacker News",
  lobsters: "Lobsters",
};
const generationLabels: Record<string, string> = {
  draft: "Draft",
  generating: "Preparing",
  ready: "Ready for review",
  failed: "Needs attention",
};

async function AdminWorkspace({ searchParams }: { searchParams: Search }) {
  const [issues, sources] = await Promise.all([
    listAdminIssues(),
    listAdminSources(),
  ]);
  const notice = mutationNoticeText((await searchParams).notice);
  return (
    <div className="admin-stack">
      <PageHeading
        eyebrow="Your daily briefing"
        title="Editorial workspace"
        description="Review the news, publish your next edition, and keep delivery on track."
        action={
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="admin-button">
              Log out
            </button>
          </form>
        }
      />
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      <MorningEditionPanel />
      <section className="admin-card" aria-labelledby="editions-heading">
        <div className="admin-card-header">
          <div>
            <h2 id="editions-heading">Recent editions</h2>
            <p>
              Your private drafts and published newsletters. Open an edition to
              review both languages.
            </p>
          </div>
          <Badge>{issues.length} recent</Badge>
        </div>
        {issues.length === 0 ? (
          <div className="admin-empty">
            <strong>Your first edition starts here.</strong>Prepare a draft to
            begin reviewing technology news.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Edition</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Model</th>
                  <th scope="col">
                    <span className="sr-only">Review edition</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <Link
                        href={`/admin/issues/${issue.id}`}
                        prefetch={false}
                        className="admin-edition-link"
                      >
                        {issue.publishedAt
                          ? `Edition #${issue.displayNumber}`
                          : `Next edition #${issue.displayNumber}`}
                      </Link>
                      <span className="admin-secondary">
                        {issue.publishedAt
                          ? "Published newsletter"
                          : "Private draft"}
                      </span>
                      {issue.generationError && (
                        <span className="admin-secondary">
                          Last generation error: {issue.generationError}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {formatAdminDate(issue.editionDate)}
                    </td>
                    <td>
                      <Badge
                        tone={
                          issue.publishedAt
                            ? "success"
                            : issue.generationStatus === "ready"
                              ? "blue"
                              : issue.generationStatus === "failed"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {issue.publishedAt
                          ? "Published"
                          : (generationLabels[issue.generationStatus] ??
                            issue.generationStatus)}
                      </Badge>
                    </td>
                    <td className="text-muted">
                      {issue.generationModel ?? "Not generated"}
                    </td>
                    <td>
                      <Link
                        href={`/admin/issues/${issue.id}`}
                        prefetch={false}
                        className="admin-link"
                        aria-label={`Open ${issue.publishedAt ? "edition" : "draft"} ${issue.displayNumber}`}
                      >
                        Open <span aria-hidden="true">↗</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="admin-grid">
        <DeliveryPanel />
        <section className="admin-card" aria-labelledby="sources-heading">
          <div className="admin-card-header">
            <div>
              <h2 id="sources-heading">News sources</h2>
              <p>Choose where your next briefing starts.</p>
            </div>
            <Badge tone="blue">
              {sources.filter((source) => source.enabled).length} active
            </Badge>
          </div>
          <ul className="admin-source-list">
            {sources.map((source) => (
              <li key={source.key} className="admin-source-row">
                <div>
                  <p className="admin-source-title">
                    {sourceNames[source.key] ?? source.key}
                    <Badge tone={source.enabled ? "success" : "neutral"}>
                      {source.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </p>
                  <p className="admin-secondary">
                    {source.candidateCount} ready candidates ·{" "}
                    {source._count.rawItems} stored
                  </p>
                </div>
                <form action="/api/admin/sources" method="post">
                  <input type="hidden" name="sourceKey" value={source.key} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={String(!source.enabled)}
                  />
                  <button
                    type="submit"
                    className="admin-button"
                    aria-label={`${source.enabled ? "Disable" : "Enable"} ${sourceNames[source.key] ?? source.key}`}
                  >
                    {source.enabled ? "Disable" : "Enable"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <div className="admin-card-body">
            <p className="admin-help">
              Disabled sources are skipped during preparation. Published
              editions retain their original sources.
            </p>
          </div>
        </section>
      </div>
      <OperationsPanel />
    </div>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense
      fallback={<LoadingPanel>Loading private workspace…</LoadingPanel>}
    >
      <AdminWorkspace searchParams={searchParams} />
    </Suspense>
  );
}
