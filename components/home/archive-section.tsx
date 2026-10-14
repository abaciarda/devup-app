"use client";

import Link from "next/link";
import { container } from "@/components/styles";
import { useLanguage } from "@/components/i18n/language";
import { publicCopy } from "@/lib/public-issues";
import type { IssueSummary } from "@/types/public-issue";

export default function ArchiveSection({ issues }: { issues: IssueSummary[] }) {
  const language = useLanguage();
  const copy = publicCopy[language];
  return (
    <section
      id="archive"
      className="scroll-mt-6 bg-[#272729] py-14 text-white sm:py-20"
    >
      <div className={container}>
        <h2 className="text-[34px] font-semibold tracking-[-1px] sm:text-[42px]">
          {copy.archive}
        </h2>
        <p className="mt-4 text-[#b1b1b6]">{copy.archiveIntro}</p>
        <div className="mt-8 divide-y divide-white/20 border-y border-white/20">
          {issues.map((issue) => (
            <Link
              key={issue.id}
              href={`/digest/${issue.date}`}
              prefetch={false}
              className="flex items-center justify-between gap-5 py-5"
            >
              <div>
                <p className="text-xs text-[#b1b1b6]">
                  {issue.date} · #{issue.editionNumber}
                </p>
                <h3 className="mt-1.5 text-[19px] font-semibold">
                  {issue.titles[language]}
                </h3>
              </div>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
        <Link
          href="/archive"
          prefetch={false}
          className="mt-6 inline-block text-sm text-[#2997ff]"
        >
          {copy.archive} →
        </Link>
      </div>
    </section>
  );
}
