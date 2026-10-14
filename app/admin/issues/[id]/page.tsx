import { mutationNoticeText } from "@/lib/server/admin/mutations";
import { readAdminIssue } from "@/lib/server/admin/preview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const instant = false;
type PreviewProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
};

async function IssuePreview({ params, searchParams }: PreviewProps) {
  const { id } = await params;
  const issue = await readAdminIssue(id);
  if (!issue) notFound();
  const notice = mutationNoticeText((await searchParams).notice);
  const quotes = new Map(
    issue.evidence.map((entry) => [entry.rawItemId, entry.quote]),
  );
  const canPublish =
    !issue.publishedAt &&
    issue.generationStatus === "ready" &&
    issue.content &&
    issue.reviewVersion;
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
      {notice && (
        <p role="status" className="rounded-lg border border-line p-4">
          {notice}
        </p>
      )}
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">
          {issue.publishedAt ? "Edition" : "Draft · next edition"} #
          {issue.displayNumber} · {issue.editionDate.toISOString().slice(0, 10)}
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
                    {content.mainStoryCount !== undefined
                      ? edition.news.indexOf(story) < content.mainStoryCount
                        ? " · Main"
                        : " · Brief"
                      : ""}
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
                  {story.discussionUrl && (
                    <a
                      href={story.discussionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm underline"
                    >
                      Open community discussion
                    </a>
                  )}
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
      {canPublish && (
        <section className="space-y-4 border-t border-line pt-6">
          <h2 className="text-xl font-semibold">
            Publish this reviewed edition
          </h2>
          <p>
            Check factual support, translations, event dates and duplicate
            events. Publication freezes this content and does not send email.
          </p>
          <form action="/api/admin/publish" method="post" className="space-y-4">
            <input type="hidden" name="issueId" value={issue.id} />
            <input
              type="hidden"
              name="reviewVersion"
              value={issue.reviewVersion ?? ""}
            />
            <label className="flex items-start gap-3">
              <input type="checkbox" name="reviewedTr" value="yes" required />I
              reviewed the Turkish edition and original sources.
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="reviewedEn" value="yes" required />I
              reviewed the English edition and matching facts.
            </label>
            <button
              type="submit"
              className="rounded-lg bg-ink px-5 py-2 text-white"
            >
              Publish reviewed edition
            </button>
          </form>
        </section>
      )}
      {issue.publishedAt && issue.reviewVersion && (
        <section className="space-y-3 border-t border-line pt-6">
          <p>
            {issue.deliveryFinishedAt
              ? `Delivery processing finished ${issue.deliveryFinishedAt.toISOString()}; check failures and provider events in the workspace.`
              : issue.deliveryStartedAt
                ? `Recipient snapshot saved ${issue.deliveryStartedAt.toISOString()}. Delivery can resume.`
                : "No email recipient snapshot yet."}
          </p>
          <form action="/api/admin/delivery" method="post">
            <input type="hidden" name="mode" value="issue" />
            <input type="hidden" name="issueId" value={issue.id} />
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2"
            >
              Start or resume email delivery
            </button>
          </form>
          <p>
            Published at {issue.publishedAt.toISOString()}. This snapshot is
            frozen; email delivery is separate.
          </p>
          <form action="/api/admin/publish" method="post">
            <input type="hidden" name="issueId" value={issue.id} />
            <input
              type="hidden"
              name="reviewVersion"
              value={issue.reviewVersion}
            />
            <input type="hidden" name="reviewedTr" value="yes" />
            <input type="hidden" name="reviewedEn" value="yes" />
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2"
            >
              Refresh public cache
            </button>
          </form>
        </section>
      )}
    </article>
  );
}

export default function IssuePage(props: PreviewProps) {
  return (
    <Suspense fallback={<p>Loading private preview…</p>}>
      <IssuePreview {...props} />
    </Suspense>
  );
}
