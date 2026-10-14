import { z } from "zod";
import type { Language } from "./digest";

export const httpUrlSchema = z
  .url()
  .max(2048)
  .refine(
    (value) => /^https?:\/\//.test(value),
    "Only HTTP(S) links are allowed",
  );

export const editorialCategories = [
  "ai",
  "security",
  "software",
  "tools",
  "open_source",
  "industry",
] as const;

export const storyCategories = [...editorialCategories, "community"] as const;

export const mainStoryLimit = 6;
export const briefStoryLimit = 4;

export const newsStorySchema = z.strictObject({
  rawItemId: z.number().int().positive(),
  category: z.enum(storyCategories),
  sourceKey: z.enum(["hackernews", "devto", "lobsters"]),
  title: z.string().trim().min(5).max(180),
  summary: z.string().trim().min(40).max(1000),
  url: httpUrlSchema,
  discussionUrl: httpUrlSchema.optional(),
});

export const localizedIssueSchema = z.strictObject({
  title: z.string().trim().min(5).max(180),
  intro: z.string().trim().min(20).max(600),
  news: z
    .array(newsStorySchema)
    .min(5)
    .max(mainStoryLimit + briefStoryLimit),
});

export const issueContentSchema = z
  .strictObject({
    version: z.literal(1),
    mainStoryCount: z.number().int().min(1).max(mainStoryLimit).optional(),
    featuredRawItemIds: z.array(z.number().int().positive()).length(3),
    tr: localizedIssueSchema,
    en: localizedIssueSchema,
  })
  .superRefine((content, context) => {
    const report = (path: (string | number)[], message: string): void => {
      context.addIssue({ code: "custom", path, message });
    };

    for (const language of ["tr", "en"] as const) {
      const localized = content[language];
      const newsIds = localized.news.map((story) => story.rawItemId);

      if (new Set(newsIds).size !== newsIds.length) {
        report([language, "news"], "News IDs must be unique");
      }
    }

    const featuredIds = content.featuredRawItemIds;
    const selectedIds = new Set(
      content.tr.news.map((story) => story.rawItemId),
    );

    if (new Set(featuredIds).size !== featuredIds.length) {
      report(["featuredRawItemIds"], "Featured IDs must be unique");
    }

    if (featuredIds.some((id) => !selectedIds.has(id))) {
      report(
        ["featuredRawItemIds"],
        "Featured IDs must reference selected news",
      );
    }

    if (content.tr.news.length !== content.en.news.length) {
      report(["en", "news"], "Both languages must contain the same news count");
    }

    if (content.mainStoryCount !== undefined) {
      const main = content.tr.news.slice(0, content.mainStoryCount);
      if (content.mainStoryCount > content.tr.news.length) {
        report(["mainStoryCount"], "Main stories must exist in the edition");
      }
      if (content.tr.news.length - content.mainStoryCount > briefStoryLimit) {
        report(["mainStoryCount"], "Too many brief stories");
      }
      if (
        featuredIds.some((id) => !main.some((story) => story.rawItemId === id))
      ) {
        report(
          ["featuredRawItemIds"],
          "Featured IDs must reference main stories",
        );
      }
    }

    content.tr.news.forEach((story, index) => {
      const translated = content.en.news[index];

      if (
        !translated ||
        story.rawItemId !== translated.rawItemId ||
        story.category !== translated.category ||
        story.sourceKey !== translated.sourceKey ||
        story.url !== translated.url ||
        story.discussionUrl !== translated.discussionUrl
      ) {
        report(
          ["en", "news", index],
          "News identity, order, and facts must match",
        );
      }
    });
  });

export type NewsStory = z.infer<typeof newsStorySchema>;
export type LocalizedIssueContent = z.infer<typeof localizedIssueSchema>;
export type IssueContent = z.infer<typeof issueContentSchema>;

export function parseIssueContent(value: unknown): IssueContent {
  return issueContentSchema.parse(value);
}

export function splitEditionStories(
  news: NewsStory[],
  featuredRawItemIds: number[],
  mainStoryCount?: number,
): { main: NewsStory[]; briefs: NewsStory[] } {
  if (mainStoryCount !== undefined) {
    return {
      main: news.slice(0, mainStoryCount),
      briefs: news.slice(mainStoryCount),
    };
  }
  const featured = new Set(featuredRawItemIds);
  return {
    main: news.filter((story) => featured.has(story.rawItemId)),
    briefs: news.filter((story) => !featured.has(story.rawItemId)),
  };
}

export function getLocalizedIssueContent(
  content: IssueContent,
  language: Language,
): LocalizedIssueContent {
  return content[language];
}
