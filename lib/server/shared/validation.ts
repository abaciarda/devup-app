import "server-only";
import { z } from "zod";
import { httpUrlSchema, newsStorySchema } from "../../../types/issue-content";

export const sourceKeySchema = newsStorySchema.shape.sourceKey;
export type SourceKey = z.infer<typeof sourceKeySchema>;

const fetchHosts: Record<SourceKey, readonly string[]> = {
  hackernews: ["hacker-news.firebaseio.com"],
  devto: ["dev.to"],
  lobsters: ["lobste.rs"],
};

export const rawItemInputSchema = z.strictObject({
  sourceKey: sourceKeySchema,
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(500),
  originalUrl: httpUrlSchema,
  excerpt: z.string().trim().max(40_000).default(""),
  publishedAt: z.date().nullable().default(null),
  score: z.number().finite().default(0),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});

export type RawItemInput = z.infer<typeof rawItemInputSchema>;

export function parseSourceFetchUrl(sourceKey: SourceKey, input: string): URL {
  const key = sourceKeySchema.parse(sourceKey);
  const parsed = new URL(z.string().max(2048).parse(input));

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    !fetchHosts[key].includes(parsed.hostname)
  ) {
    throw new Error("Source fetch URL is outside the approved HTTPS hosts");
  }

  return parsed;
}
