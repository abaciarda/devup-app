"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language";
import StoryRow from "@/components/digest/story-row";
import { container, eyebrow, link } from "@/components/styles";
import { featuredStories, publicCopy, storyForCard } from "@/lib/public-issues";
import type { PublicIssue } from "@/types/public-issue";

export default function TodaySection({ issue }: { issue: PublicIssue | null }) {
  const language = useLanguage();
  const copy = publicCopy[language];
  if (!issue)
    return (
      <section id="today" className={`${container} scroll-mt-6 py-14 sm:py-20`}>
        <h2 className="text-3xl font-semibold">{copy.emptyTitle}</h2>
        <p className="mt-4 text-muted">{copy.emptyBody}</p>
      </section>
    );
  const edition = issue.content[language];
  return (
    <section id="today" className={`${container} scroll-mt-6 py-14 sm:py-20`}>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className={eyebrow}>
            {copy.latest} · #{issue.editionNumber}
          </p>
          <h2 className="mt-4 max-w-[820px] text-[28px] font-semibold leading-[1.2] tracking-[-.7px] sm:text-[34px]">
            {edition.title}
          </h2>
        </div>
        <p className="shrink-0 text-xs text-muted">
          {issue.date}
          <br />
          {edition.news.length} {copy.stories}
        </p>
      </div>
      <p className="mt-5 max-w-[760px] text-[17px] text-muted">
        {edition.intro}
      </p>
      <ol className="mt-8 max-w-[960px] divide-y divide-line border-y border-line">
        {featuredStories(issue, language).map((story, index) => (
          <li key={story.rawItemId}>
            <StoryRow
              story={storyForCard(story, language)}
              index={index}
              preview
            />
          </li>
        ))}
      </ol>
      <Link
        href={`/digest/${issue.date}`}
        prefetch={false}
        className={`${link} mt-6`}
      >
        {copy.fullIssue} <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
