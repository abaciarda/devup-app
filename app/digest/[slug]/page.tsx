import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import EditionContent from "@/components/digest/edition-content";
import { loadPublishedIssue } from "@/lib/server/published-issues";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
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

async function PublishedDigest({ params }: Props) {
  await connection();
  const { slug } = await params;
  const issue = await loadPublishedIssue(slug);
  if (!issue) notFound();
  return <EditionContent issue={issue} />;
}

export default function DigestPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="px-6 py-12">Loading edition…</p>}>
      <PublishedDigest params={params} />
    </Suspense>
  );
}
