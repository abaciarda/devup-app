import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Hero from "@/components/home/hero";
import TodaySection from "@/components/home/today-section";
import ArchiveSection from "@/components/home/archive-section";
import HomeDocumentMetadata from "@/components/i18n/home-document-metadata";
import { loadHomeIssues } from "@/lib/server/published-issues";

export const metadata: Metadata = {
  title: "devup — Daily tech news for developers",
  description:
    "Technology, software, and AI news summarized from developer communities.",
  alternates: { canonical: "/" },
};

async function PublishedSections() {
  await connection();
  const issues = await loadHomeIssues();
  return (
    <>
      <TodaySection issue={issues.latest} />
      <ArchiveSection issues={issues.previous} />
    </>
  );
}

export default function Home() {
  return (
    <main id="main">
      <HomeDocumentMetadata />
      <Hero />
      <Suspense fallback={<p className="px-6 py-12">Loading editions…</p>}>
        <PublishedSections />
      </Suspense>
    </main>
  );
}
