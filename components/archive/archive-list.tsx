"use client";

import Link from "next/link";
import { useLanguage, useLocalizedHref } from "@/components/i18n/language";
import { publicCopy } from "@/lib/public-issues";
import type { ArchivePage } from "@/types/public-issue";

export default function ArchiveList({ page }: { page: ArchivePage }) {
  const language = useLanguage();
  const href = useLocalizedHref();
  const copy = publicCopy[language];
  return (
    <main
      id="main"
      className="mx-auto max-w-[1200px] space-y-6 px-6 py-14 sm:px-10 sm:py-20"
    >
      <h1 className="text-4xl font-semibold">{copy.archive}</h1>
      <p className="text-muted">{copy.archiveIntro}</p>
      {page.issues.length === 0 ? (
        <p>{copy.emptyArchive}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {page.issues.map((issue) => (
            <li key={issue.id} className="py-5">
              <Link
                href={href(`/digest/${issue.date}`)}
                prefetch={false}
                className="text-xl font-semibold"
              >
                {issue.titles[language]}
              </Link>
              <p className="mt-2 text-sm text-muted">
                {issue.date} · #{issue.editionNumber} · {issue.storyCount}{" "}
                {copy.stories}
              </p>
            </li>
          ))}
        </ul>
      )}
      <nav
        aria-label={copy.archive}
        className="flex flex-wrap gap-6 text-sm text-blue"
      >
        {page.newer && (
          <Link href={href(`/archive?after=${page.newer}`)} prefetch={false}>
            ← {copy.newer}
          </Link>
        )}
        {page.older && (
          <Link href={href(`/archive?before=${page.older}`)} prefetch={false}>
            {copy.older} →
          </Link>
        )}
        {!page.issues.length && (
          <Link href={href("/archive")} prefetch={false}>
            {copy.firstPage}
          </Link>
        )}
      </nav>
    </main>
  );
}
