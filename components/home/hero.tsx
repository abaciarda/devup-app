"use client";

import SubscribeForm from "@/components/newsletter/subscribe-form";
import { container, eyebrow, link } from "@/components/styles";
import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";

export default function Hero() {
  const copy = messages[useLanguage()];

  return (
    <section id="subscribe" className="bg-pearl pt-10 text-center sm:pt-14">
      <div className={container}>
        <p className={eyebrow}>{copy.heroEyebrow}</p>
        <h1 className="mx-auto mt-5 max-w-[760px] text-[36px] font-semibold leading-[1.07] tracking-[-1.6px] sm:text-[68px] sm:tracking-[-3px]">
          {copy.heroHeadlineFirst}
          <br />
          <span className="text-muted">{copy.heroHeadlineSecond}</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[530px] text-[17px] leading-relaxed text-muted">
          {copy.heroDescription}
        </p>
        <SubscribeForm />
        <a href="#today" className={`${link} mt-6`}>
          {copy.sampleLink} <span aria-hidden="true">↓</span>
        </a>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4 border-t border-line py-6 text-xs text-muted sm:mt-11 sm:justify-between">
          <span className="w-full text-[9px] tracking-[1.3px] sm:w-auto">
            {copy.sourcesLabel}
          </span>
          {[
            ["Y", "Hacker News"],
            ["DEV", "dev.to"],
            ["r/", "Reddit"],
            ["〈/〉", "LeetCode"],
            ["▥", "Codeforces"],
            ["H", "HackerRank"],
          ].map(([mark, name]) => (
            <span key={name} className="inline-flex items-center gap-2">
              <b className="text-sm font-semibold text-ink">{mark}</b>
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
