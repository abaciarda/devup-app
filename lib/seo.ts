import type { Metadata } from "next";
import type { Language } from "@/types/digest";
import type { IssueSummary, PublicIssue } from "@/types/public-issue";
import { messages } from "@/components/i18n/messages";
import {
  htmlLanguages,
  languageAlternates,
  localizedPath,
  openGraphLocales,
} from "./localized-routes";
import { siteUrl } from "./site";

export const siteOrigin = siteUrl ?? new URL("http://localhost:3000");

export function absoluteUrl(path: string): string {
  return new URL(path, siteOrigin).href;
}

const feedTitles: Record<Language, string> = {
  tr: "devup — Türkçe bülten",
  en: "devup — English edition",
};

export function pageMetadata({
  language,
  path,
  title,
  description,
  absoluteTitle = false,
  article,
}: {
  language: Language;
  path: string;
  title: string;
  description: string;
  absoluteTitle?: boolean;
  article?: { publishedTime: string };
}): Metadata {
  const url = localizedPath(path, language);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
      types: {
        "application/rss+xml": [
          {
            url: localizedPath("/rss.xml", language),
            title: feedTitles[language],
          },
        ],
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "devup",
      locale: openGraphLocales[language],
      alternateLocale: [openGraphLocales[language === "tr" ? "en" : "tr"]],
      ...(article
        ? {
            type: "article",
            publishedTime: article.publishedTime,
            modifiedTime: article.publishedTime,
          }
        : { type: "website" }),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

const organizationId = () => absoluteUrl("/#organization");
const websiteId = (language: Language) =>
  absoluteUrl(`${localizedPath("/", language)}#website`);

export function siteGraph(language: Language) {
  return [
    {
      "@type": "Organization",
      "@id": organizationId(),
      name: "devup",
      url: absoluteUrl("/"),
      description: messages[language].pageDescription,
    },
    {
      "@type": "WebSite",
      "@id": websiteId(language),
      url: absoluteUrl(localizedPath("/", language)),
      name: "devup",
      description: messages[language].pageDescription,
      inLanguage: htmlLanguages[language],
      publisher: { "@id": organizationId() },
    },
  ];
}

function breadcrumb(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

const crumbs: Record<Language, { home: string; archive: string }> = {
  tr: { home: "Ana sayfa", archive: "Arşiv" },
  en: { home: "Home", archive: "Archive" },
};

export function issueGraph(issue: PublicIssue, language: Language) {
  const edition = issue.content[language];
  const path = localizedPath(`/digest/${issue.date}`, language);
  const url = absoluteUrl(path);
  return [
    ...siteGraph(language),
    {
      "@type": "NewsArticle",
      "@id": `${url}#edition`,
      url,
      mainEntityOfPage: url,
      headline: edition.title.slice(0, 110),
      description: edition.intro,
      inLanguage: htmlLanguages[language],
      datePublished: issue.publishedAt,
      dateModified: issue.publishedAt,
      image: absoluteUrl(`${path}/opengraph-image`),
      isPartOf: { "@id": websiteId(language) },
      publisher: { "@id": organizationId() },
      author: { "@id": organizationId() },
      articleSection: language === "tr" ? "Teknoloji" : "Technology",
      citation: edition.news.map((story) => ({
        "@type": "CreativeWork",
        name: story.title,
        url: story.url,
      })),
    },
    breadcrumb([
      { name: crumbs[language].home, path: localizedPath("/", language) },
      {
        name: crumbs[language].archive,
        path: localizedPath("/archive", language),
      },
      { name: edition.title, path },
    ]),
  ];
}

export function archiveGraph(issues: IssueSummary[], language: Language) {
  const path = localizedPath("/archive", language);
  return [
    ...siteGraph(language),
    {
      "@type": "CollectionPage",
      "@id": `${absoluteUrl(path)}#archive`,
      url: absoluteUrl(path),
      name: crumbs[language].archive,
      inLanguage: htmlLanguages[language],
      isPartOf: { "@id": websiteId(language) },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: issues.map((issue, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: absoluteUrl(localizedPath(`/digest/${issue.date}`, language)),
          name: issue.titles[language],
        })),
      },
    },
    breadcrumb([
      { name: crumbs[language].home, path: localizedPath("/", language) },
      { name: crumbs[language].archive, path },
    ]),
  ];
}

export function serializeJsonLd(graph: object[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c");
}
