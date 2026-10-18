import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import LocalizedApplication from "@/components/i18n/localized-application";
import { messages } from "@/components/i18n/messages";
import {
  htmlLanguages,
  isLanguage,
  siteLanguages,
} from "@/lib/localized-routes";
import { pageMetadata, siteOrigin } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import "../globals.css";

type Props = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export function generateStaticParams() {
  return siteLanguages.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const copy = messages[language];
  return {
    metadataBase: siteOrigin,
    applicationName: "devup",
    ...pageMetadata({
      language,
      path: "/",
      title: copy.pageTitle,
      description: copy.pageDescription,
    }),
    title: { default: copy.pageTitle, template: "%s — devup" },
    robots: { index: Boolean(siteUrl), follow: true },
  };
}

export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  return (
    <html lang={htmlLanguages[language]}>
      <body>
        <LocalizedApplication language={language}>
          {children}
        </LocalizedApplication>
        <SpeedInsights />
      </body>
    </html>
  );
}
