import type { Metadata } from "next";
import { notFound } from "next/navigation";
import EditionContent from "@/components/digest/edition-content";
import { editions, getEdition } from "@/lib/editions";

export function generateStaticParams() {
  return editions.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const edition = getEdition(slug);
  if (!edition) return {};
  return { title: edition.title, description: edition.intro };
}

export default async function EditionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const edition = getEdition(slug);
  if (!edition) notFound();
  return <EditionContent edition={edition} />;
}
