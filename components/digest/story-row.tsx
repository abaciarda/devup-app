"use client";

import { link } from "@/components/styles";
import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";
import type { Story } from "@/types/digest";

export default function StoryRow({
  story,
  index,
  preview = false,
}: {
  story: Story;
  index: number;
  preview?: boolean;
}) {
  const language = useLanguage();
  const copy = messages[language];
  const summary = preview
    ? Array.from(
        new Intl.Segmenter(language, { granularity: "sentence" }).segment(
          story.summary,
        ),
      )
        .slice(0, 2)
        .map(({ segment }) => segment)
        .join("")
        .trim()
    : story.summary;

  return (
    <article className="grid grid-cols-[24px_minmax(0,1fr)] gap-4 py-7 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-6 sm:py-9">
      <span
        aria-hidden="true"
        className="pt-0.5 text-sm text-muted tabular-nums"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{story.topic}</span>
          <span aria-hidden="true">·</span>
          <span>{story.source}</span>
        </div>
        <h3 className="mt-3 max-w-[800px] break-words text-[22px] font-semibold leading-[1.3] tracking-[-.5px] sm:text-[26px]">
          {story.title}
        </h3>
        <p className="mt-3 max-w-[760px] break-words text-[16px] leading-relaxed text-muted sm:text-[17px]">
          {summary}
        </p>
        <a
          href={story.url}
          target="_blank"
          rel="noopener noreferrer"
          className={link + " mt-4"}
        >
          {copy.sourceLink} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}
