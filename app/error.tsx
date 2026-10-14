"use client";

import { useLanguage } from "@/components/i18n/language";
import { publicCopy } from "@/lib/public-issues";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const copy = publicCopy[useLanguage()];
  return (
    <main id="main" className="mx-auto max-w-[1200px] space-y-5 px-6 py-14">
      <h1 className="text-3xl font-semibold">{copy.unavailable}</h1>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-line px-4 py-2"
      >
        {copy.tryAgain}
      </button>
    </main>
  );
}
