"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language";
import StoryCard from "@/components/digest/story-card";
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
          <h2 className="mt-4 max-w-[800px] text-[34px] font-semibold leading-tight tracking-[-1.3px] sm:text-[42px]">
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
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {featuredStories(issue, language).map((story, index) => (
          <StoryCard
            key={story.rawItemId}
            story={storyForCard(story, language)}
            index={index}
          />
        ))}
      </div>
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
