import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditionContent from "@/components/digest/edition-content";
import { loadPublishedIssue } from "@/lib/server/issues/published";

type Props = { params: Promise<{ slug: string }> };

export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const issue = await loadPublishedIssue(slug);
  if (!issue)
    return {
      title: "Edition not found",
      robots: { index: false, follow: false },
    };
  return {
    title: issue.content.en.title,
    description: issue.content.en.intro,
    alternates: { canonical: `/digest/${issue.date}` },
  };
}

export default async function DigestPage({ params }: Props) {
  const { slug } = await params;
  const issue = await loadPublishedIssue(slug);
  if (!issue) notFound();
  return <EditionContent issue={issue} />;
}
