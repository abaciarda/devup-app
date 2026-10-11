"use client";

import Link from "next/link";
import type { Edition } from "@/types/digest";
import { getLocalizedEdition } from "@/lib/edition-locales";
import { container } from "@/components/styles";
import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";

export default function ArchiveSection({
  editions,
}: {
  editions: readonly Edition[];
}) {
  const language = useLanguage();
  const copy = messages[language];

  return (
    <section
      id="archive"
      className="scroll-mt-6 bg-[#272729] py-14 text-white sm:py-20"
    >
      <div className={container}>
        <p className="text-[11px] font-semibold tracking-[1.6px] text-[#b1b1b6] uppercase">
          {copy.archiveEyebrow}
        </p>
        <h2 className="mt-3 text-[34px] font-semibold tracking-[-1px] sm:text-[42px]">
          {copy.archiveTitle}
        </h2>
        <p className="mt-4 text-[17px] text-[#b1b1b6]">
          {copy.archiveDescription}
        </p>
        <div className="mt-8 divide-y divide-white/20 border-y border-white/20">
          {editions.map((edition) => {
            const localizedEdition = getLocalizedEdition(edition, language);
            return (
              <Link
                key={edition.slug}
                href={`/digest/${edition.slug}`}
                className="flex items-center justify-between gap-5 py-5"
              >
                <div>
                  <p className="text-xs text-[#b1b1b6]">{edition.date}</p>
                  <h3 className="mt-1.5 text-[19px] font-semibold tracking-[-.4px]">
                    {localizedEdition.title}
                  </h3>
                </div>
                <span className="text-xl text-[#2997ff]" aria-hidden="true">
                  ↗
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-5 text-xs text-[#b1b1b6]">{copy.sampleArchive}</p>
      </div>
    </section>
  );
}
