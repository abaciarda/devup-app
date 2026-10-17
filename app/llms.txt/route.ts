import { localizedPath } from "@/lib/localized-routes";
import { absoluteUrl } from "@/lib/seo";
import { loadFeedIssues } from "@/lib/server/issues/published";

export async function GET(): Promise<Response> {
  const issues = await loadFeedIssues();
  const editions = issues
    .slice(0, 10)
    .flatMap((issue) => [
      `- [${issue.content.en.title}](${absoluteUrl(localizedPath(`/digest/${issue.date}`, "en"))}): ${issue.content.en.intro} (${issue.date}, English)`,
      `- [${issue.content.tr.title}](${absoluteUrl(`/digest/${issue.date}`)}): ${issue.content.tr.intro} (${issue.date}, Türkçe)`,
    ]);
  const body = [
    "# devup",
    "",
    "> devup is a free daily technology newsletter for software developers, published every morning in Turkish and English. Each edition summarizes 6 main stories and up to 4 brief stories about software, AI, security, developer tools and the technology industry, and links every story to its original source.",
    "",
    "Stories are discovered on Hacker News, Lobsters and Dev.to, read from the original publisher, summarized in both languages by an AI model from the article text, and validated against that text before publication. Turkish is served at the site root and English under /en.",
    "",
    "## Editions",
    "",
    `- [Latest edition, Turkish](${absoluteUrl("/")})`,
    `- [Latest edition, English](${absoluteUrl("/en")})`,
    `- [Archive, Turkish](${absoluteUrl("/archive")})`,
    `- [Archive, English](${absoluteUrl("/en/archive")})`,
    "",
    "## Feeds",
    "",
    `- [RSS, Turkish](${absoluteUrl("/rss.xml")})`,
    `- [RSS, English](${absoluteUrl("/en/rss.xml")})`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml")})`,
    "",
    ...(editions.length ? ["## Recent editions", "", ...editions, ""] : []),
    "## Optional",
    "",
    `- [Privacy notice, English](${absoluteUrl("/en/privacy")})`,
    `- [Gizlilik bildirimi, Türkçe](${absoluteUrl("/privacy")})`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
