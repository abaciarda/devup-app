import { z } from "zod";
import { editionDateFromKey } from "./edition-date";
import { issueContentSchema, type NewsStory } from "../types/issue-content";
import type { Language, Story } from "../types/digest";
import type {
  ArchiveCursor,
  IssueSummary,
  PublicIssue,
} from "../types/public-issue";

const publicRowSchema = z.strictObject({
  id: z.number().int().positive(),
  editionNumber: z.number().int().positive(),
  editionDate: z.date(),
  publishedAt: z.date(),
  content: issueContentSchema,
});

export function parsePublicIssue(value: unknown): PublicIssue {
  const row = publicRowSchema.parse(value);
  return {
    id: row.id,
    editionNumber: row.editionNumber,
    date: row.editionDate.toISOString().slice(0, 10),
    publishedAt: row.publishedAt.toISOString(),
    content: row.content,
  };
}

export function summarizeIssue(issue: PublicIssue): IssueSummary {
  return {
    id: issue.id,
    editionNumber: issue.editionNumber,
    date: issue.date,
    titles: { tr: issue.content.tr.title, en: issue.content.en.title },
    storyCount: issue.content.en.news.length,
  };
}

export function parseArchiveCursor(
  before: unknown,
  after: unknown,
): ArchiveCursor {
  if (before !== undefined && after !== undefined)
    throw new Error("Choose one archive cursor");
  if (before === undefined && after === undefined) return null;
  const value = before ?? after;
  if (typeof value !== "string") throw new Error("Invalid archive cursor");
  editionDateFromKey(value);
  return { direction: before !== undefined ? "before" : "after", date: value };
}

const sources = {
  hackernews: "Hacker News",
  devto: "Dev.to",
  lobsters: "Lobsters",
};
const categories: Record<Language, Record<NewsStory["category"], string>> = {
  en: {
    ai: "AI",
    security: "Security",
    software: "Software",
    tools: "Tools",
    open_source: "Open source",
    industry: "Industry",
    community: "Community",
  },
  tr: {
    ai: "Yapay zekâ",
    security: "Güvenlik",
    software: "Yazılım",
    tools: "Araçlar",
    open_source: "Açık kaynak",
    industry: "Sektör",
    community: "Topluluk",
  },
};

export function storyForCard(story: NewsStory, language: Language): Story {
  return {
    topic: categories[language][story.category],
    source: sources[story.sourceKey],
    title: story.title,
    summary: story.summary,
    url: story.url,
  };
}

export function featuredStories(
  issue: PublicIssue,
  language: Language,
): NewsStory[] {
  const byId = new Map(
    issue.content[language].news.map((story) => [story.rawItemId, story]),
  );
  return issue.content.featuredRawItemIds.map((id) => {
    const story = byId.get(id);
    if (!story) throw new Error("Invalid featured story reference");
    return story;
  });
}

export const publicCopy = {
  en: {
    latest: "Latest edition",
    emptyTitle: "The first edition is on its way.",
    emptyBody:
      "Published technology news will appear here after editorial review.",
    fullIssue: "Read the full edition",
    archive: "All editions",
    archiveIntro: "Published editions, newest first.",
    emptyArchive: "No editions on this page.",
    older: "Older editions",
    newer: "Newer editions",
    firstPage: "Latest editions",
    stories: "stories",
    issue: "Edition",
    deliveryTime: "Each morning · Free",
    unavailable: "The editions are temporarily unavailable.",
    tryAgain: "Try again",
  },
  tr: {
    latest: "Son bülten",
    emptyTitle: "İlk bülten hazırlanıyor.",
    emptyBody:
      "Yayımlanan teknoloji haberleri, editör incelemesinden sonra burada görünecek.",
    fullIssue: "Bültenin tamamını oku",
    archive: "Tüm bültenler",
    archiveIntro: "Yayımlanan bültenler, yeniden eskiye.",
    emptyArchive: "Bu sayfada bülten yok.",
    older: "Önceki bültenler",
    newer: "Daha yeni bültenler",
    firstPage: "Son bültenler",
    stories: "haber",
    issue: "Bülten",
    deliveryTime: "Her sabah · Ücretsiz",
    unavailable: "Bültenlere şu anda ulaşılamıyor.",
    tryAgain: "Tekrar dene",
  },
} as const;
