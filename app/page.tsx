import type { Metadata } from "next";
import Hero from "@/components/home/hero";
import TodaySection from "@/components/home/today-section";
import ArchiveSection from "@/components/home/archive-section";
import HomeDocumentMetadata from "@/components/i18n/home-document-metadata";
import { loadHomeIssues } from "@/lib/server/issues/published";

export const metadata: Metadata = {
  title: "devup — Daily tech news for developers",
  description:
    "Technology, software, and AI news summarized from developer communities.",
  alternates: { canonical: "/" },
};

export const instant = false;

export default async function Home() {
  const issues = await loadHomeIssues();
  return (
    <main id="main">
      <HomeDocumentMetadata />
      <Hero />
      <TodaySection issue={issues.latest} />
      <ArchiveSection issues={issues.previous} />
    </main>
  );
}
