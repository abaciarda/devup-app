"use client";

import { link } from "@/components/styles";
import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";
import type { Story } from "@/types/digest";
import StoryArt from "./story-art";

export default function StoryCard({
  story,
  index,
}: {
  story: Story;
  index: number;
}) {
  const language = useLanguage();
  const copy = messages[language];

  return (
    <article className="flex flex-col overflow-hidden rounded-[18px] border border-line">
      <StoryArt index={index} />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex justify-between gap-3 text-[11px] text-[#59595e]">
          <span>{story.source}</span>
          <span>{story.topic}</span>
        </div>
        <h3 className="mt-4 break-words text-[22px] font-semibold leading-tight tracking-[-.7px] sm:text-[24px]">
          {story.title}
        </h3>
        <p className="mt-4 flex-1 break-words text-[16px] leading-relaxed text-muted">
          {story.summary}
        </p>
        <a
          href={story.url}
          target="_blank"
          rel="noreferrer"
          className={link + " mt-6"}
        >
          {copy.sourceLink} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
