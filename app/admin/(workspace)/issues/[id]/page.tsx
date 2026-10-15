import { mutationNoticeText } from "@/lib/server/admin/mutations";
import { readAdminIssue } from "@/lib/server/admin/preview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  Badge,
  PageHeading,
  LoadingPanel,
  formatAdminDate,
} from "@/components/admin/presentation";

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
    <article className="admin-stack">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin" prefetch={false} className="admin-link">
          <span aria-hidden="true">← </span>All editions
        </Link>
        <form action="/api/admin/logout" method="post">
          <button type="submit" className="admin-button">
            Log out
          </button>
        </form>
      </div>
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      <PageHeading
        eyebrow="Editorial review"
        title={`${issue.publishedAt ? "Edition" : "Next edition"} #${issue.displayNumber}`}
        description={`${formatAdminDate(issue.editionDate)} · Review both languages and their original sources before publication.`}
        action={
          <Badge
            tone={
              issue.publishedAt
                ? "success"
                : issue.generationStatus === "ready"
                  ? "blue"
                  : "warning"
            }
          >
            {issue.publishedAt
              ? "Published and frozen"
              : issue.generationStatus === "ready"
                ? "Private · ready for review"
                : `Private · ${issue.generationStatus}`}
          </Badge>
        }
      />
      <div className="space-y-3">
        {issue.generationError && (
          <p className="admin-warning">
            Last generation error: {issue.generationError}. Existing content
            below may belong to the earlier successful run.
          </p>
        )}
        {issue.invalidContent && (
          <p role="alert" className="admin-warning">
            Stored content failed validation. Do not publish this issue.
          </p>
        )}
        {!issue.content && !issue.invalidContent && (
          <p className="admin-empty">No valid draft content yet.</p>
        )}
      </div>
      <div className="admin-review-grid">
        {issue.content &&
          (["tr", "en"] as const).map((language) => {
            const content = issue.content;
            if (!content) return null;
            const edition = content[language];
            return (
              <section key={language} lang={language} className="admin-card">
                <header className="admin-language-header">
                  <Badge tone="blue">
                    {language === "tr" ? "Türkçe" : "English"}
                  </Badge>
                  <h2>{edition.title}</h2>
                  <p>{edition.intro}</p>
                </header>
                {edition.news.map((story, index) => (
                  <article key={story.rawItemId} className="admin-story">
                    <div className="admin-story-meta">
                      <span>
                        {index + 1}. {story.sourceKey} ·{" "}
                        {story.category.replaceAll("_", " ")}
                      </span>
                      {content.mainStoryCount !== undefined && (
                        <Badge>
                          {index < content.mainStoryCount
                            ? "Main story"
                            : "Brief"}
                        </Badge>
                      )}
                      {content.featuredRawItemIds.includes(story.rawItemId) && (
                        <Badge tone="blue">Featured</Badge>
                      )}
                    </div>
                    <h3>{story.title}</h3>
                    <p className="admin-story-summary">{story.summary}</p>
                    <div className="admin-actions">
                      <a
                        href={story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="admin-link"
                      >
                        Open original source
                      </a>
                      {story.discussionUrl && (
                        <a
                          href={story.discussionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="admin-link"
                        >
                          Open community discussion
                        </a>
                      )}
                    </div>
                    {quotes.has(story.rawItemId) ? (
                      <blockquote className="admin-evidence">
                        <p>Source evidence</p>
                        <p>{quotes.get(story.rawItemId)}</p>
                      </blockquote>
                    ) : (
                      <p className="admin-warning mt-4">
                        No saved evidence quote. Inspect the original source
                        before approval.
                      </p>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
      </div>
      {canPublish && (
        <section className="admin-card admin-card-body admin-stack">
          <h2>Publish this reviewed edition</h2>
          <p className="admin-description">
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
            <label className="admin-checkbox">
              <input type="checkbox" name="reviewedTr" value="yes" required />I
              reviewed the Turkish edition and original sources.
            </label>
            <label className="admin-checkbox">
              <input type="checkbox" name="reviewedEn" value="yes" required />I
              reviewed the English edition and matching facts.
            </label>
            <button type="submit" className="admin-button admin-button-primary">
              Publish reviewed edition
            </button>
          </form>
        </section>
      )}
      {issue.publishedAt && issue.reviewVersion && (
        <section className="admin-card admin-card-body admin-stack">
          <h2>Email delivery</h2>
          <p className="admin-description">
            {issue.deliveryFinishedAt
              ? `Delivery processing finished ${issue.deliveryFinishedAt.toISOString()}; check failures and provider events in the workspace.`
              : issue.deliveryStartedAt
                ? `Recipient snapshot saved ${issue.deliveryStartedAt.toISOString()}. Delivery can resume.`
                : "No email recipient snapshot yet."}
          </p>
          <form action="/api/admin/delivery" method="post">
            <input type="hidden" name="mode" value="issue" />
            <input type="hidden" name="issueId" value={issue.id} />
            <button type="submit" className="admin-button admin-button-primary">
              Start or resume email delivery
            </button>
          </form>
          <p className="admin-help">
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
            <button type="submit" className="admin-button">
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
    <Suspense fallback={<LoadingPanel>Loading private preview…</LoadingPanel>}>
      <IssuePreview {...props} />
    </Suspense>
  );
}
