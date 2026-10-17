import type { ReactNode } from "react";
import SiteFooter from "@/components/layout/site-footer";
import SiteHeader from "@/components/layout/site-header";
import { LanguageProvider } from "@/components/i18n/language";
import SkipLink from "@/components/i18n/skip-link";
import type { Language } from "@/types/digest";

export default function LocalizedApplication({
  children,
  language,
}: {
  children: ReactNode;
  language: Language;
}) {
  return (
    <LanguageProvider language={language}>
      <SkipLink />
      <SiteHeader />
      {children}
      <SiteFooter />
    </LanguageProvider>
  );
}
