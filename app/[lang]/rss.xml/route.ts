import { messages } from "@/components/i18n/messages";
import {
  htmlLanguages,
  isLanguage,
  localizedPath,
} from "@/lib/localized-routes";
import { absoluteUrl } from "@/lib/seo";
import { loadFeedIssues } from "@/lib/server/issues/published";

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const channelTitles = {
  tr: "devup — Günlük teknoloji özeti",
  en: "devup — Daily tech news for developers",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> },
): Promise<Response> {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const issues = await loadFeedIssues();
  const home = absoluteUrl(localizedPath("/", language));
  const self = absoluteUrl(localizedPath("/rss.xml", language));
  const items = issues
    .map((issue) => {
      const edition = issue.content[language];
      const link = absoluteUrl(
        localizedPath(`/digest/${issue.date}`, language),
      );
      const body = [
        `<p>${xml(edition.intro)}</p>`,
        "<ol>",
        ...edition.news.map(
          (story) =>
            `<li><a href="${xml(story.url)}">${xml(story.title)}</a><br/>${xml(story.summary)}</li>`,
        ),
        "</ol>",
      ].join("");
      return [
        "<item>",
        `<title>${xml(edition.title)}</title>`,
        `<link>${xml(link)}</link>`,
        `<guid isPermaLink="true">${xml(link)}</guid>`,
        `<pubDate>${new Date(issue.publishedAt).toUTCString()}</pubDate>`,
        `<description>${xml(edition.intro)}</description>`,
        `<content:encoded>${xml(body)}</content:encoded>`,
        "</item>",
      ].join("");
    })
    .join("");
  const latest = issues[0]?.publishedAt;
  const feed = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "<channel>",
    `<title>${xml(channelTitles[language])}</title>`,
    `<link>${xml(home)}</link>`,
    `<description>${xml(messages[language].pageDescription)}</description>`,
    `<language>${htmlLanguages[language].toLowerCase()}</language>`,
    `<atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
    latest
      ? `<lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>`
      : "",
    items,
    "</channel>",
    "</rss>",
  ].join("");
  return new Response(feed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
