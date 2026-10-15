import type { ReactNode } from "react";
import SiteFooter from "@/components/layout/site-footer";
import SiteHeader from "@/components/layout/site-header";
import { LanguageProvider } from "@/components/i18n/language";
import SkipLink from "@/components/i18n/skip-link";
import { getRequestLanguages } from "@/lib/request-language";
import ApplicationChrome from "@/components/layout/application-chrome";

export default async function LocalizedApplication({
  children,
}: {
  children: ReactNode;
}) {
  const { language, newsletterLanguage } = await getRequestLanguages();

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
