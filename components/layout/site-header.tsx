"use client";

import { container } from "@/components/styles";
import { useLanguage, useLocalizedHref } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";
import { localizedPath, stripLanguage } from "@/lib/localized-routes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Language } from "@/types/digest";

export default function SiteHeader() {
  const language = useLanguage();
  const href = useLocalizedHref();
  const { path } = stripLanguage(usePathname());
  const copy = messages[language];
  const switchTo = (target: Language) => localizedPath(path, target);

  return (
    <header className="bg-black text-white">
      <div
        className={`${container} flex min-h-16 flex-wrap items-center justify-between gap-x-5 gap-y-2 py-2 sm:h-16 sm:flex-nowrap sm:py-0`}
      >
        <Link
          href={href("/")}
          aria-label={copy.homeLabel}
          className="text-[25px] font-bold tracking-[-1.3px]"
        >
          devup<span className="ml-1 font-normal">↗</span>
        </Link>
        <nav
          aria-label={copy.navLabel}
          className="order-3 flex w-full items-center justify-center gap-6 text-xs text-[#d2d2d7] sm:order-none sm:w-auto sm:justify-start sm:gap-8"
        >
          <Link href={href("/#today")}>{copy.todayLink}</Link>
          <Link href={href("/archive")} className="focus-visible:rounded-sm">
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
            <Link
              href={switchTo("tr")}
              hrefLang="tr"
              lang="tr"
              aria-current={language === "tr" ? "true" : undefined}
              className={
                language === "tr"
                  ? "rounded-full bg-white px-3 py-1.5 text-ink"
                  : "rounded-full px-3 py-1.5 text-[#d2d2d7]"
              }
            >
              Türkçe
            </Link>
            <Link
              href={switchTo("en")}
              hrefLang="en"
              lang="en"
              aria-current={language === "en" ? "true" : undefined}
              className={
                language === "en"
                  ? "rounded-full bg-white px-3 py-1.5 text-ink"
                  : "rounded-full px-3 py-1.5 text-[#d2d2d7]"
              }
            >
              English
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
