"use client";

import { useEffect } from "react";
import { useLanguage } from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";

export default function HomeDocumentMetadata() {
  const copy = messages[useLanguage()];

  useEffect(() => {
    document.title = copy.pageTitle;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );

    if (description) description.content = copy.pageDescription;
  }, [copy.pageDescription, copy.pageTitle]);

  return null;
}
