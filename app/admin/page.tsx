import { listAdminIssues } from "@/lib/server/admin-preview";
import Link from "next/link";
import { Suspense } from "react";

export const instant = false;

async function IssueList() {
  const issues = await listAdminIssues();
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Recent issues</h1>
        <form action="/api/admin/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-line px-4 py-2"
          >
            Log out
          </button>
        </form>
      </div>
      <p className="text-sm text-muted">
        Review both languages and their sources. Publication controls arrive in
        Task 07.
      </p>
      {issues.length === 0 ? (
        <p>No issues yet. Complete Task 05 and generate a private draft.</p>
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
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p>Loading private issues…</p>}>
      <IssueList />
    </Suspense>
  );
}
