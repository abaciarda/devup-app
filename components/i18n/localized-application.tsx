import type { ReactNode } from "react";
import SiteFooter from "@/components/layout/site-footer";
import SiteHeader from "@/components/layout/site-header";
import { LanguageProvider } from "@/components/i18n/language";
import SkipLink from "@/components/i18n/skip-link";
import type { getRequestLanguages } from "@/lib/request-language";
import ApplicationChrome from "@/components/layout/application-chrome";

export default function LocalizedApplication({
  children,
  languages,
}: {
  children: ReactNode;
  languages: Awaited<ReturnType<typeof getRequestLanguages>>;
}) {
  const { language, newsletterLanguage } = languages;

  return (
    <LanguageProvider
      initialLanguage={language}
      initialNewsletterLanguage={newsletterLanguage}
    >
      <ApplicationChrome
        header={
          <>
            <SkipLink />
            <SiteHeader />
          </>
        }
        footer={<SiteFooter />}
      >
        {children}
      </ApplicationChrome>
    </LanguageProvider>
  );
}
