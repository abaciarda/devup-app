import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArchiveList from "@/components/archive/archive-list";
import JsonLd from "@/components/seo/json-ld";
import { isLanguage } from "@/lib/localized-routes";
import { parseArchiveCursor, publicCopy } from "@/lib/public-issues";
import { archiveGraph, pageMetadata } from "@/lib/seo";
import { loadArchivePage } from "@/lib/server/issues/published";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    before?: string | string[];
    after?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const search = await searchParams;
  const copy = publicCopy[language];
  const metadata = pageMetadata({
    language,
    path: "/archive",
    title: copy.archive,
    description: copy.archiveDescription,
  });
  return search.before || search.after
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

export const instant = false;

export default async function ArchivePage({ params, searchParams }: Props) {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const search = await searchParams;
  let cursor: ReturnType<typeof parseArchiveCursor>;
  try {
    cursor = parseArchiveCursor(search.before, search.after);
  } catch {
    notFound();
  }
  const page = await loadArchivePage(cursor);
  return (
    <>
      <JsonLd graph={archiveGraph(page.issues, language)} />
      <ArchiveList page={page} />
    </>
  );
}
