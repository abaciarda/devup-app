"use client";

import type { Edition } from "@/types/digest";
import StoryCard from "@/components/digest/story-card";
import { getLocalizedEdition } from "@/lib/edition-locales";
import { container, eyebrow } from "@/components/styles";
import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";

export default function TodaySection({ edition }: { edition: Edition }) {
  const language = useLanguage();
  const copy = messages[language];
  const localizedEdition = getLocalizedEdition(edition, language);

  return (
    <section id="today" className={`${container} scroll-mt-6 py-14 sm:py-20`}>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className={eyebrow}>
            {copy.todayEyebrow} / {edition.slug.slice(-2)}
          </p>
          <h2 className="mt-4 max-w-[800px] text-[34px] font-semibold leading-tight tracking-[-1.3px] sm:text-[42px]">
            {localizedEdition.title}
          </h2>
        </div>
        <p className="shrink-0 text-xs text-muted sm:text-right">
          {edition.date}
          <br />
          {localizedEdition.stories.length} {copy.storyCount}
        </p>
      </div>
      <p className="mt-5 max-w-[760px] text-[17px] text-muted">
        {localizedEdition.intro}
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {localizedEdition.stories.map((story, index) => (
          <StoryCard
            key={`${story.source}-${index}`}
            story={story}
            index={index}
          />
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-muted">
        {copy.sampleEdition}
      </p>
    </section>
  );
}
