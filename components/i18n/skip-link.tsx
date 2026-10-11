"use client";

import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";

export default function SkipLink() {
  const language = useLanguage();

  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-blue focus:px-5 focus:py-3 focus:text-white"
    >
      {messages[language].skip}
    </a>
  );
}
