import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { localizedPath, siteLanguages } from "@/lib/localized-routes";
import { absoluteUrl } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import { loadSitemapIssues } from "@/lib/server/issues/published";

function localized(
  path: string,
  extra: Omit<MetadataRoute.Sitemap[number], "url" | "alternates"> = {},
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    siteLanguages.map((language) => [
      language,
      absoluteUrl(localizedPath(path, language)),
    ]),
  );
  return siteLanguages.map((language) => ({
    url: absoluteUrl(localizedPath(path, language)),
    alternates: { languages },
    ...extra,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  if (!siteUrl) return [];
  const issues = await loadSitemapIssues();
  const latest = issues[0]?.publishedAt;
  return [
    ...localized("/", { lastModified: latest, changeFrequency: "daily" }),
    ...localized("/archive", {
      lastModified: latest,
      changeFrequency: "daily",
    }),
    ...localized("/privacy", { changeFrequency: "yearly" }),
    ...issues.flatMap((issue) =>
      localized(`/digest/${issue.date}`, { lastModified: issue.publishedAt }),
    ),
  ];
}
