import { mutationNoticeText } from "@/lib/server/admin-mutations";
import { listAdminIssues, listAdminSources } from "@/lib/server/admin-preview";
import Link from "next/link";
import { Suspense } from "react";

export const instant = false;
type Search = Promise<{ notice?: string | string[] }>;

async function AdminWorkspace({ searchParams }: { searchParams: Search }) {
  const [issues, sources] = await Promise.all([
    listAdminIssues(),
    listAdminSources(),
  ]);
  const notice = mutationNoticeText((await searchParams).notice);
  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Editorial workspace</h1>
        <form action="/api/admin/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-line px-4 py-2"
          >
            Log out
          </button>
        </form>
      </div>
      {notice && (
        <p role="status" className="rounded-lg border border-line p-4">
          {notice}
        </p>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">News sources</h2>
        <p className="text-sm text-muted">
          Disabled sources are skipped during preparation. Existing published
          editions stay unchanged.
        </p>
        <ul className="divide-y divide-line">
          {sources.map((source) => (
            <li
              key={source.key}
              className="flex items-center justify-between gap-4 py-3"
            >
              <p>
                {source.key} · {source.enabled ? "Enabled" : "Disabled"}
              </p>
              <form action="/api/admin/sources" method="post">
                <input type="hidden" name="sourceKey" value={source.key} />
                <input
                  type="hidden"
                  name="enabled"
                  value={String(!source.enabled)}
                />
                <button
                  type="submit"
                  className="rounded-lg border border-line px-4 py-2"
                >
                  {source.enabled ? "Disable" : "Enable"} {source.key}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Recent issues</h2>
        <p className="text-sm text-muted">
          Review both languages, their evidence and original sources before
          publication.
        </p>
        {issues.length === 0 ? (
          <p>No issues yet. Generate a private draft with Task 05.</p>
        ) : (
          <ul className="divide-y divide-line">
            {issues.map((issue) => (
              <li key={issue.id} className="space-y-1 py-4">
                <Link
                  href={`/admin/issues/${issue.id}`}
                  prefetch={false}
                  className="font-medium underline"
                >
                  Issue #{issue.id} ·{" "}
                  {issue.editionDate.toISOString().slice(0, 10)}
                </Link>
                <p className="text-sm">
                  {issue.generationStatus} ·{" "}
                  {issue.publishedAt ? "Published" : "Private"} ·{" "}
                  {issue.generationModel ?? "No successful model yet"}
                </p>
                {issue.generationError && (
                  <p className="text-sm">
                    Last generation error: {issue.generationError}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<p>Loading private workspace…</p>}>
      <AdminWorkspace searchParams={searchParams} />
    </Suspense>
  );
}
