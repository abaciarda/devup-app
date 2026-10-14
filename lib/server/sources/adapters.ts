import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
  rawItemInputSchema,
  type RawItemInput,
  type SourceKey,
} from "../shared/validation";
import { fetchSourceJson, sourceErrorCode, SourceFetchError } from "./http";
import {
  hasUsefulSourceText,
  isNewsPost,
  newsRejection,
  normalizeStoryUrl,
  plainSourceText,
} from "./text";
import { ArticleError, readArticle } from "./articles";

export type SourceBatch = {
  items: RawItemInput[];
  retiredExternalIds: string[];
  listed: number;
  rejected: number;
  errors: string[];
  exclusions?: Record<string, number>;
};

export type SourceContext = {
  now: Date;
  signal: AbortSignal;
  fetcher?: typeof fetch;
  pause?: (signal: AbortSignal) => Promise<void>;
  articleReader?: typeof readArticle;
};

const arraySchema = z.array(z.unknown()).max(1000);
const timestampSchema = z.iso.datetime({ offset: true });

const hnSchema = z.object({
  id: z.number().int().positive(),
  type: z.string().optional(),
  deleted: z.boolean().optional(),
  dead: z.boolean().optional(),
  title: z.string().max(20_000).optional(),
  text: z.string().max(600_000).optional(),
  url: z.string().max(2048).optional(),
  time: z.number().int().positive().optional(),
  score: z.number().finite().default(0),
});

const devSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().max(20_000),
  url: z.string().max(2048),
  published_timestamp: timestampSchema,
  public_reactions_count: z.number().finite().default(0),
  tag_list: z.union([z.array(z.string()), z.string()]).default([]),
});

const devDetailSchema = devSchema.extend({
  body_html: z.string().max(600_000),
});

const lobstersSchema = z.object({
  short_id: z
    .string()
    .regex(/^[a-z0-9]+$/)
    .max(20),
  created_at: timestampSchema,
  title: z.string().max(20_000),
  url: z.string().max(2048),
  score: z.number().finite().default(0),
  description_plain: z.string().max(600_000).default(""),
  description: z.string().max(600_000).default(""),
  tags: z.array(z.string()).default([]),
});

function newBatch(): SourceBatch {
  return {
    items: [],
    retiredExternalIds: [],
    listed: 0,
    rejected: 0,
    errors: [],
    exclusions: {},
  };
}

function fresh(date: Date, now: Date): boolean {
  const age = now.getTime() - date.getTime();
  return Number.isFinite(age) && age >= -300_000 && age <= 72 * 60 * 60 * 1000;
}

const articleWorkers = 6;

async function eachConcurrently<T>(
  values: T[],
  workers: number,
  signal: AbortSignal,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, values.length) }, async () => {
      while (!signal.aborted) {
        const index = next++;
        if (index >= values.length) break;
        await task(values[index]);
      }
    }),
  );
}

function exclude(batch: SourceBatch, reason: string): void {
  batch.exclusions ??= {};
  batch.exclusions[reason] = (batch.exclusions[reason] ?? 0) + 1;
}

async function articleText(
  batch: SourceBatch,
  url: string,
  context: SourceContext,
): Promise<string> {
  try {
    return await (context.articleReader ?? readArticle)(url, context.signal);
  } catch (error) {
    exclude(
      batch,
      error instanceof ArticleError ? error.code : "article_network_or_timeout",
    );
    return "";
  }
}

function addItem(batch: SourceBatch, input: RawItemInput, now: Date): void {
  try {
    const item = rawItemInputSchema.parse(input);
    normalizeStoryUrl(item.originalUrl);
    if (
      !item.publishedAt ||
      !fresh(item.publishedAt, now) ||
      !isNewsPost(item.title, item.tags)
    ) {
      batch.rejected += 1;
      return;
    }
    if (!hasUsefulSourceText(item.excerpt)) {
      batch.rejected += 1;
      exclude(batch, "insufficient_evidence");
      return;
    }
    const reason = newsRejection(item.title, item.tags, item.excerpt);
    if (reason) {
      batch.rejected += 1;
      exclude(batch, reason);
      return;
    }
    batch.items.push(item);
  } catch {
    batch.rejected += 1;
  }
}

function recordFailure(batch: SourceBatch, error: unknown): boolean {
  if (batch.errors.length < 5) batch.errors.push(sourceErrorCode(error));
  return error instanceof SourceFetchError && error.status === 429;
}

async function hackerNews(
  limit: number,
  context: SourceContext,
): Promise<SourceBatch> {
  const data = await fetchSourceJson(
    "hackernews",
    "https://hacker-news.firebaseio.com/v0/topstories.json",
    context.signal,
    context.fetcher,
  );
  const ids = z
    .array(z.number().int().positive())
    .max(1000)
    .parse(data)
    .slice(0, limit);
  const batch = newBatch();
  batch.listed = ids.length;
  let next = 0;
  let stopped = false;

  await Promise.all(
    Array.from({ length: Math.min(articleWorkers, ids.length) }, async () => {
      while (!stopped && !context.signal.aborted) {
        const index = next++;
        if (index >= ids.length) break;
        const id = ids[index];
        try {
          const value = await fetchSourceJson(
            "hackernews",
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            context.signal,
            context.fetcher,
          );
          const parsed = hnSchema.safeParse(value);
          if (!parsed.success || parsed.data.id !== id) {
            batch.rejected += 1;
            continue;
          }
          const item = parsed.data;
          if (item.deleted || item.dead) {
            batch.retiredExternalIds.push(String(id));
            continue;
          }
          if (item.type !== "story" || !item.title || !item.time) {
            batch.rejected += 1;
            continue;
          }
          if (
            !fresh(new Date(item.time * 1000), context.now) ||
            !isNewsPost(item.title, [])
          ) {
            batch.rejected += 1;
            continue;
          }
          const excerpt = item.url
            ? await articleText(batch, item.url, context)
            : plainSourceText(item.text ?? "");
          addItem(
            batch,
            {
              sourceKey: "hackernews",
              externalId: String(id),
              title: plainSourceText(item.title, 500),
              originalUrl:
                item.url || `https://news.ycombinator.com/item?id=${id}`,
              excerpt,
              publishedAt: new Date(item.time * 1000),
              score: item.score,
              tags: [],
            },
            context.now,
          );
        } catch (error) {
          stopped = recordFailure(batch, error) || stopped;
        }
      }
    }),
  );

  if (context.signal.aborted && batch.errors.length < 5)
    batch.errors.push("source_timeout");
  return batch;
}

async function devto(
  limit: number,
  context: SourceContext,
): Promise<SourceBatch> {
  const data = await fetchSourceJson(
    "devto",
    `https://dev.to/api/articles?top=3&per_page=${limit}`,
    context.signal,
    context.fetcher,
  );
  const rows = arraySchema.parse(data).slice(0, limit);
  const batch = newBatch();
  batch.listed = rows.length;

  for (let index = 0; index < rows.length; index += 1) {
    if (context.signal.aborted) {
      if (batch.errors.length < 5) batch.errors.push("source_timeout");
      break;
    }
    const listed = devSchema.safeParse(rows[index]);
    if (
      !listed.success ||
      !fresh(new Date(listed.data.published_timestamp), context.now)
    ) {
      batch.rejected += 1;
      continue;
    }

    const listedTags = Array.isArray(listed.data.tag_list)
      ? listed.data.tag_list
      : listed.data.tag_list.split(",").map((tag) => tag.trim());
    const earlyReason = newsRejection(listed.data.title, listedTags);
    if (
      earlyReason &&
      [
        "not_news",
        "community_or_lifestyle",
        "tutorial_or_personal_post",
      ].includes(earlyReason)
    ) {
      batch.rejected += 1;
      exclude(batch, earlyReason);
      continue;
    }

    try {
      const pause =
        context.pause ??
        ((signal: AbortSignal) => delay(2100, undefined, { signal }));
      await pause(context.signal);
      const value = await fetchSourceJson(
        "devto",
        `https://dev.to/api/articles/${listed.data.id}`,
        context.signal,
        context.fetcher,
      );
      const parsed = devDetailSchema.safeParse(value);
      if (!parsed.success || parsed.data.id !== listed.data.id) {
        batch.rejected += 1;
        continue;
      }
      const article = parsed.data;
      const tags = (
        Array.isArray(article.tag_list)
          ? article.tag_list
          : article.tag_list.split(",")
      )
        .map((tag) => tag.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 20);

      addItem(
        batch,
        {
          sourceKey: "devto",
          externalId: String(article.id),
          title: plainSourceText(article.title, 500),
          originalUrl: article.url,
          excerpt: plainSourceText(article.body_html),
          publishedAt: new Date(article.published_timestamp),
          score: article.public_reactions_count,
          tags,
        },
        context.now,
      );
    } catch (error) {
      if (
        error instanceof SourceFetchError &&
        [404, 410].includes(error.status ?? 0)
      ) {
        batch.retiredExternalIds.push(String(listed.data.id));
      } else if (recordFailure(batch, error)) {
        break;
      }
    }
  }
  return batch;
}

async function lobsters(
  limit: number,
  context: SourceContext,
): Promise<SourceBatch> {
  const data = await fetchSourceJson(
    "lobsters",
    "https://lobste.rs/hottest.json",
    context.signal,
    context.fetcher,
  );
  const rows = arraySchema.parse(data).slice(0, limit);
  const batch = newBatch();
  batch.listed = rows.length;

  await eachConcurrently(
    rows,
    articleWorkers,
    context.signal,
    async (value) => {
      const parsed = lobstersSchema.safeParse(value);
      if (!parsed.success) {
        batch.rejected += 1;
        return;
      }
      const story = parsed.data;
      if (
        !fresh(new Date(story.created_at), context.now) ||
        !isNewsPost(story.title, story.tags)
      ) {
        batch.rejected += 1;
        return;
      }
      const excerpt = story.url
        ? await articleText(batch, story.url, context)
        : plainSourceText(story.description_plain || story.description);
      addItem(
        batch,
        {
          sourceKey: "lobsters",
          externalId: story.short_id,
          title: plainSourceText(story.title, 500),
          originalUrl: story.url || `https://lobste.rs/s/${story.short_id}`,
          excerpt,
          publishedAt: new Date(story.created_at),
          score: story.score,
          tags: story.tags
            .map((tag) => tag.trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 20),
        },
        context.now,
      );
    },
  );
  if (context.signal.aborted && batch.errors.length < 5)
    batch.errors.push("source_timeout");
  return batch;
}

export async function fetchSource(
  key: SourceKey,
  limit: number,
  context: SourceContext,
): Promise<SourceBatch> {
  const count = z.number().int().min(1).max(40).parse(limit);
  const adapters = { hackernews: hackerNews, devto, lobsters };
  return adapters[key](count, context);
}
