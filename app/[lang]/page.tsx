import type { Metadata } from "next";
import Hero from "@/components/home/hero";
import TodaySection from "@/components/home/today-section";
import ArchiveSection from "@/components/home/archive-section";
import JsonLd from "@/components/seo/json-ld";
import { messages } from "@/components/i18n/messages";
import { isLanguage } from "@/lib/localized-routes";
import { pageMetadata, siteGraph } from "@/lib/seo";
import { loadHomeIssues } from "@/lib/server/issues/published";

type Props = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const copy = messages[language];
  return pageMetadata({
    language,
    path: "/",
    title: copy.pageTitle,
    description: copy.pageDescription,
    absoluteTitle: true,
  });
}

export const instant = false;

export default async function Home({ params }: Props) {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const issues = await loadHomeIssues();
  return (
    <main id="main">
      <JsonLd graph={siteGraph(language)} />
      <Hero />
      <TodaySection issue={issues.latest} />
      <ArchiveSection issues={issues.previous} />
    </main>
  );
}
