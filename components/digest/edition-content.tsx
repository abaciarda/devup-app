"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language";
import { publicCopy, storyForCard } from "@/lib/public-issues";
import type { PublicIssue } from "@/types/public-issue";
import StoryCard from "./story-card";

export default function EditionContent({ issue }: { issue: PublicIssue }) {
  const language = useLanguage();
  const copy = publicCopy[language];
  const edition = issue.content[language];
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-[1200px] px-6 py-14 sm:px-10 sm:py-20"
    >
      <p className="text-[11px] font-semibold tracking-[1.6px] text-muted uppercase">
        {copy.issue} #{issue.editionNumber} · {issue.date}
      </p>
      <h1 className="mt-4 max-w-[850px] text-[38px] font-semibold leading-tight tracking-[-1.5px] sm:text-[56px]">
        {edition.title}
      </h1>
      <p className="mt-5 max-w-[760px] text-lg text-muted">{edition.intro}</p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {edition.news.map((story, index) => (
          <StoryCard
            key={story.rawItemId}
            story={storyForCard(story, language)}
            index={index}
          />
        ))}
      </div>
      <Link
        href="/archive"
        prefetch={false}
        className="mt-8 inline-block text-blue"
      >
        {copy.archive} →
      </Link>
    </main>
  );
}
