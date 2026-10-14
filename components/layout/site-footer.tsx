"use client";

import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";
import Link from "next/link";

export default function Footer() {
  const language = useLanguage();
  const copy = messages[language];

  return (
    <footer className="bg-pearl pt-12 pb-7 text-muted sm:pt-14">
      <div className="mx-auto max-w-[1200px] px-6 sm:px-10">
        <div className="grid gap-x-10 gap-y-9 border-b border-line pb-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Link
              href="/"
              className="text-[28px] font-bold tracking-[-1.5px] text-ink"
            >
              devup<span className="ml-1 font-normal">↗</span>
            </Link>
            <p className="mt-4 max-w-[290px] text-sm leading-relaxed">
              {copy.footerDescription}
            </p>
            <Link
              href="/#subscribe"
              className="mt-5 inline-flex items-center gap-3 text-sm text-blue"
            >
              {copy.footerSubscribe} <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {copy.footerDailyRead}
            </h2>
            <nav
              aria-label={copy.footerNavLabel}
              className="mt-4 flex flex-col items-start gap-3 text-sm"
            >
              <Link href="/#today" className="text-blue">
                {copy.todayLink}
              </Link>
              <Link href="/archive" className="text-blue">
                {copy.footerPrevious}
              </Link>
              <Link href="/#subscribe" className="text-blue">
                {copy.footerSubscribeFree}
              </Link>
            </nav>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {copy.footerCommunity}
            </h2>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                ["Hacker News", "https://news.ycombinator.com/"],
                ["Dev.to", "https://dev.to/"],
                ["Lobsters", "https://lobste.rs/"],
              ].map(([name, url]) => (
                <li key={name}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue"
                  >
                    {name} <span aria-hidden="true">↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">
              {copy.footerMorning}
            </h2>
            <p className="mt-4 text-sm leading-relaxed">{copy.sendTime}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[11px]">
          <span>{copy.footerCopyright}</span>
          <Link href="/#today" className="text-blue">
            {copy.footerBack}{" "}
            <span aria-hidden="true" className="ml-2">
              ↑
            </span>
          </Link>
        </div>
      </div>
    </footer>
  );
}
