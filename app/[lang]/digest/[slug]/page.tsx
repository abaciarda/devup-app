import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditionContent from "@/components/digest/edition-content";
import JsonLd from "@/components/seo/json-ld";
import { isLanguage } from "@/lib/localized-routes";
import { publicCopy } from "@/lib/public-issues";
import { issueGraph, pageMetadata } from "@/lib/seo";
import { loadPublishedIssue } from "@/lib/server/issues/published";

type Props = { params: Promise<{ lang: string; slug: string }> };

export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const issue = await loadPublishedIssue(slug);
  if (!issue)
    return {
      title: publicCopy[language].notFound,
      robots: { index: false, follow: false },
    };
  const edition = issue.content[language];
  return pageMetadata({
    language,
    path: `/digest/${issue.date}`,
    title: edition.title,
    description: edition.intro,
    article: { publishedTime: issue.publishedAt },
  });
}

export default async function DigestPage({ params }: Props) {
  const { lang, slug } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const issue = await loadPublishedIssue(slug);
  if (!issue) notFound();
  return (
    <>
      <JsonLd graph={issueGraph(issue, language)} />
      <EditionContent issue={issue} />
    </>
  );
}
