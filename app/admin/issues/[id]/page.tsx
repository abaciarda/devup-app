import { readAdminIssue } from "@/lib/server/admin-preview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const instant = false;

async function IssuePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const issue = await readAdminIssue(id);
  if (!issue) notFound();
  const quotes = new Map(
    issue.evidence.map((entry) => [entry.rawItemId, entry.quote]),
  );
  return (
    <article className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin" prefetch={false} className="underline">
          All issues
        </Link>
        <form action="/api/admin/logout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-line px-4 py-2"
          >
            Log out
          </button>
        </form>
      </div>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">
          Issue #{issue.id} · {issue.editionDate.toISOString().slice(0, 10)}
        </h1>
        <p>
          {issue.generationStatus} ·{" "}
          {issue.publishedAt ? "Published and frozen" : "Private draft"}
        </p>
        {issue.generationError && (
          <p>
            Last generation error: {issue.generationError}. Existing content
            below may belong to the earlier successful run.
          </p>
        )}
        {issue.invalidContent && (
          <p role="alert">
            Stored content failed validation. Do not publish this issue.
          </p>
        )}
        {!issue.content && !issue.invalidContent && (
          <p>No valid draft content yet.</p>
        )}
      </header>
      {issue.content &&
        (["tr", "en"] as const).map((language) => {
          const content = issue.content;
          if (!content) return null;
          const edition = content[language];
          return (
            <section
              key={language}
              lang={language}
              className="space-y-5 border-t border-line pt-6"
            >
              <h2 className="text-2xl font-semibold">
                {language === "tr" ? "Türkçe" : "English"}: {edition.title}
              </h2>
              <p>{edition.intro}</p>
              {edition.news.map((story) => (
                <article
                  key={story.rawItemId}
                  className="space-y-3 rounded-xl border border-line p-5"
                >
                  <p className="text-xs text-muted">
                    {story.sourceKey} · {story.category} · #{story.rawItemId}
                    {content.featuredRawItemIds.includes(story.rawItemId)
                      ? " · Featured"
                      : ""}
                  </p>
                  <h3 className="text-xl font-semibold">{story.title}</h3>
                  <p className="whitespace-pre-wrap">{story.summary}</p>
                  <a
                    href={story.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm underline"
                  >
                    Open original source
                  </a>
                  {quotes.has(story.rawItemId) ? (
                    <blockquote className="border-l-2 border-line pl-4 text-sm">
                      <p>Source evidence</p>
                      <p>{quotes.get(story.rawItemId)}</p>
                    </blockquote>
                  ) : (
                    <p className="text-sm">
                      No saved evidence quote. Inspect the original source
                      before approval.
                    </p>
                  )}
                </article>
              ))}
            </section>
          );
        })}
    </article>
  );
}

export default function IssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading private preview…</p>}>
      <IssuePreview params={params} />
    </Suspense>
  );
}
