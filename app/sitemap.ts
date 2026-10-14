import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { siteUrl } from "@/lib/site";
import { loadSitemapIssues } from "@/lib/server/published-issues";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  if (!siteUrl) return [];
  const issues = await loadSitemapIssues();
  return [
    { url: siteUrl.href },
    { url: new URL("/archive", siteUrl).href },
    ...issues.map((issue) => ({
      url: new URL(`/digest/${issue.date}`, siteUrl).href,
      lastModified: issue.publishedAt,
    })),
  ];
}
