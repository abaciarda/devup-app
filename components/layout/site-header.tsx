"use client";

import { container } from "@/components/styles";
import { useLanguage, useSetLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";
import Link from "next/link";

export default function SiteHeader() {
  const language = useLanguage();
  const setLanguage = useSetLanguage();
  const copy = messages[language];

  return (
    <header className="bg-black text-white">
      <div
        className={`${container} flex min-h-16 flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2 sm:h-16 sm:flex-nowrap sm:py-0`}
      >
        <Link
          href="/"
          aria-label={copy.homeLabel}
          className="text-[25px] font-bold tracking-[-1.3px]"
        >
          devup<span className="ml-1 font-normal">↗</span>
        </Link>
        <nav
          aria-label={copy.navLabel}
          className="order-3 flex w-full items-center justify-center gap-6 text-xs text-[#d2d2d7] sm:order-none sm:w-auto sm:justify-start sm:gap-8"
        >
          <Link href="/#today">{copy.todayLink}</Link>
          <Link href="/archive" className="focus-visible:rounded-sm">
            {copy.archiveLink}
          </Link>
        </nav>
        <div className="flex items-center gap-1 rounded-full bg-white/10 p-1 text-[11px]">
          <span className="sr-only" id="site-language-label">
            {copy.readIn}
          </span>
          <div
            role="group"
            aria-labelledby="site-language-label"
            className="flex items-center gap-1"
          >
            <button
              type="button"
              aria-pressed={language === "tr"}
              onClick={() => setLanguage("tr")}
              className={
                language === "tr"
                  ? "rounded-full bg-white px-3 py-1.5 text-ink"
                  : "rounded-full px-3 py-1.5 text-[#d2d2d7]"
              }
            >
              Türkçe
            </button>
            <button
              type="button"
              aria-pressed={language === "en"}
              onClick={() => setLanguage("en")}
              className={
                language === "en"
                  ? "rounded-full bg-white px-3 py-1.5 text-ink"
                  : "rounded-full px-3 py-1.5 text-[#d2d2d7]"
              }
            >
              English
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
