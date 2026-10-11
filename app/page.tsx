import type { Metadata } from "next";
import { editions } from "@/lib/editions";
import Hero from "@/components/home/hero";
import TodaySection from "@/components/home/today-section";
import ArchiveSection from "@/components/home/archive-section";
import HomeDocumentMetadata from "@/components/i18n/home-document-metadata";

export const metadata: Metadata = {
  title: "devup — Daily tech news for developers",
  description:
    "A five-minute daily email summarizing technology, software, and AI news from developer communities.",
};

export default function Home() {
  return (
    <main id="main">
      <HomeDocumentMetadata />
      <Hero />
      <TodaySection edition={editions[0]} />
      <ArchiveSection editions={editions.slice(1)} />
    </main>
  );
}
