"use client";

import Link from "next/link";
import { useLanguage, useLocalizedHref } from "@/components/i18n/language";
import { publicCopy, storyForCard } from "@/lib/public-issues";
import type { PublicIssue } from "@/types/public-issue";
import StoryRow from "./story-row";

export default function EditionContent({ issue }: { issue: PublicIssue }) {
  const language = useLanguage();
  const href = useLocalizedHref();
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
      <h1 className="mt-4 max-w-[850px] text-[30px] font-semibold leading-[1.2] tracking-[-.8px] sm:text-[40px]">
        {edition.title}
      </h1>
      <p className="mt-5 max-w-[760px] text-lg text-muted">{edition.intro}</p>
      <ol className="mt-10 max-w-[960px] divide-y divide-line border-y border-line">
        {edition.news.map((story, index) => (
          <li key={story.rawItemId}>
            <StoryRow story={storyForCard(story, language)} index={index} />
          </li>
        ))}
      </ol>
      <Link
        href={href("/archive")}
        prefetch={false}
        className="mt-8 inline-block text-blue"
      >
        {copy.archive} →
      </Link>
    </main>
  );
}
