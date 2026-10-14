import { z } from "zod";
import type { Language } from "./digest";

export const httpUrlSchema = z
  .url()
  .max(2048)
  .refine(
    (value) => /^https?:\/\//.test(value),
    "Only HTTP(S) links are allowed",
  );

export const newsStorySchema = z.strictObject({
  rawItemId: z.number().int().positive(),
  category: z.enum(["ai", "software", "tools", "open_source", "community"]),
  sourceKey: z.enum(["hackernews", "devto", "lobsters"]),
  title: z.string().trim().min(5).max(180),
  summary: z.string().trim().min(40).max(1000),
  url: httpUrlSchema,
  discussionUrl: httpUrlSchema.optional(),
});

export const localizedIssueSchema = z.strictObject({
  title: z.string().trim().min(5).max(180),
  intro: z.string().trim().min(20).max(600),
  news: z.array(newsStorySchema).min(5).max(8),
});

export const issueContentSchema = z
  .strictObject({
    version: z.literal(1),
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

export function getLocalizedIssueContent(
  content: IssueContent,
  language: Language,
): LocalizedIssueContent {
  return content[language];
}
