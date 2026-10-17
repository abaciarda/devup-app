"use client";

import Link from "next/link";
import { useLanguage, useLocalizedHref } from "@/components/i18n/language";
import { publicCopy } from "@/lib/public-issues";

export default function NotFound() {
  const copy = publicCopy[useLanguage()];
  const href = useLocalizedHref();
  return (
    <main id="main" className="mx-auto max-w-[1200px] space-y-5 px-6 py-20">
      <title>{`${copy.notFound} — devup`}</title>
      <meta name="robots" content="noindex" />
      <h1 className="text-3xl font-semibold">{copy.notFound}</h1>
      <p className="text-muted">{copy.notFoundBody}</p>
      <Link href={href("/")} className="inline-block text-blue">
        {copy.backHome} →
      </Link>
    </main>
  );
}
