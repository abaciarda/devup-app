"use client";

import type { Edition } from "@/types/digest";
import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";
import { getLocalizedEdition } from "@/lib/edition-locales";
import StoryCard from "@/components/digest/story-card";

export default function EditionContent({ edition }: { edition: Edition }) {
  const language = useLanguage();
  const copy = messages[language];
  const localizedEdition = getLocalizedEdition(edition, language);

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-[1200px] px-6 py-14 sm:px-10 sm:py-20"
    >
      <p className="text-[11px] font-semibold tracking-[1.6px] text-muted uppercase">
        {copy.issueIntroLabel} · {localizedEdition.date}
      </p>
      <h1 className="mt-4 max-w-[850px] text-[38px] font-semibold leading-tight tracking-[-1.5px] sm:text-[56px]">
        {localizedEdition.title}
      </h1>
      <p className="mt-5 max-w-[760px] text-lg text-muted">
        {localizedEdition.intro}
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {localizedEdition.stories.map((story, index) => (
          <StoryCard
            key={`${story.source}-${index}`}
            story={story}
            index={index}
          />
        ))}
      </div>
    </main>
  );
}
