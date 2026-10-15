import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArchiveList from "@/components/archive/archive-list";
import { parseArchiveCursor } from "@/lib/public-issues";
import { loadArchivePage } from "@/lib/server/issues/published";

export const metadata: Metadata = {
  title: "Published editions",
  description: "Browse published technology-news editions.",
  alternates: { canonical: "/archive" },
};
type Props = {
  searchParams: Promise<{
    before?: string | string[];
    after?: string | string[];
  }>;
};

export const instant = false;

export default async function ArchivePage({ searchParams }: Props) {
  const search = await searchParams;
  let cursor: ReturnType<typeof parseArchiveCursor>;
  try {
    cursor = parseArchiveCursor(search.before, search.after);
  } catch {
    notFound();
  }
  return <ArchiveList page={await loadArchivePage(cursor)} />;
}
