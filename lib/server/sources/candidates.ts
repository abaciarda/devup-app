import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { getDb } from "../database/client";
import {
  hasUsefulSourceText,
  isNewsPost,
  newsRejection,
  normalizeStoryUrl,
  titleSimilarity,
} from "./text";
import { sourceKeySchema, type SourceKey } from "../shared/validation";

export const sourceKeys: SourceKey[] = ["hackernews", "lobsters", "devto"];

export const minimumEditionStories = 6;
export const candidateLimit = 22;
const similarTitleThreshold = 0.6;

const sourceBudgets: Record<SourceKey, number> = {
  hackernews: 14,
  lobsters: 6,
  devto: 2,
};

const sourceCaps: Record<SourceKey, number> = {
  hackernews: 22,
  lobsters: 10,
  devto: 4,
};

const sourceWeights: Record<SourceKey, number> = {
  hackernews: 1,
  lobsters: 0.85,
  devto: 0.6,
};

const rowSchema = z.object({
  id: z.number().int().positive(),
  externalId: z.string().optional(),
  title: z.string(),
  originalUrl: z.string(),
  normalizedUrl: z.string(),
  excerpt: z.string(),
  publishedAt: z.date().nullable(),
  fetchedAt: z.date(),
  score: z.number().finite(),
  tags: z.array(z.string()),
  usedIssueId: z.number().int().nullable(),
  source: z.object({ key: sourceKeySchema, enabled: z.boolean() }),
});

export type Candidate = {
  rawItemId: number;
  sourceKey: SourceKey;
  title: string;
  sourceText: string;
  originalUrl: string;
  normalizedUrl: string;
  publishedAt: Date;
  tags: string[];
  sourceRank: number;
  discussionUrl?: string;
};

export function prepareCandidates(
  records: unknown[],
  usedUrls: Set<string>,
  now: Date = new Date(),
): Candidate[] {
  const cutoff = now.getTime() - 72 * 60 * 60 * 1000;
  const recentFetch = now.getTime() - 90 * 60 * 1000;
  const groups = new Map<
    SourceKey,
    (z.infer<typeof rowSchema> & { publishedAt: Date })[]
  >();

  for (const value of records) {
    const parsed = rowSchema.safeParse(value);
    if (!parsed.success) continue;
    const row = parsed.data;
    if (
      row.usedIssueId !== null ||
      !row.source.enabled ||
      !row.publishedAt ||
      row.publishedAt.getTime() < cutoff ||
      row.publishedAt.getTime() > now.getTime() + 300_000 ||
      row.fetchedAt.getTime() < recentFetch ||
      row.fetchedAt.getTime() > now.getTime() + 300_000 ||
      !hasUsefulSourceText(row.excerpt) ||
      !isNewsPost(row.title, row.tags) ||
      newsRejection(row.title, row.tags, row.excerpt) !== null
    )
      continue;

    try {
      if (
        normalizeStoryUrl(row.originalUrl) !== row.normalizedUrl ||
        usedUrls.has(row.normalizedUrl)
      )
        continue;
    } catch {
      continue;
    }
    const group = groups.get(row.source.key) ?? [];
    group.push({ ...row, publishedAt: row.publishedAt });
    groups.set(row.source.key, group);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        b.score - a.score ||
        b.publishedAt.getTime() - a.publishedAt.getTime() ||
        a.id - b.id,
    );
  }

  const pool: Candidate[] = [];
  const seenUrls = new Set<string>();
  const counts = new Map<SourceKey, number>();
  const consider = (key: SourceKey, index: number, cap: number): void => {
    const group = groups.get(key);
    const row = group?.[index];
    if (
      !group ||
      !row ||
      pool.length >= candidateLimit ||
      (counts.get(key) ?? 0) >= cap ||
      seenUrls.has(row.normalizedUrl) ||
      pool.some(
        (chosen) =>
          titleSimilarity(chosen.title, row.title) >= similarTitleThreshold,
      )
    )
      return;
    pool.push({
      rawItemId: row.id,
      sourceKey: key,
      title: row.title,
      sourceText: row.excerpt,
      originalUrl: row.originalUrl,
      normalizedUrl: row.normalizedUrl,
      publishedAt: row.publishedAt,
      tags: row.tags,
      sourceRank: group.length === 1 ? 1 : 1 - index / (group.length - 1),
      ...(key === "hackernews" && /^\d+$/.test(row.externalId ?? "")
        ? {
            discussionUrl: `https://news.ycombinator.com/item?id=${row.externalId}`,
          }
        : key === "lobsters" && /^[a-z0-9]{1,20}$/.test(row.externalId ?? "")
          ? { discussionUrl: `https://lobste.rs/s/${row.externalId}` }
          : {}),
    });
    seenUrls.add(row.normalizedUrl);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (const key of sourceKeys) {
    const group = groups.get(key) ?? [];
    for (let index = 0; index < group.length; index += 1)
      consider(key, index, sourceBudgets[key]);
  }
  for (const key of sourceKeys) {
    const group = groups.get(key) ?? [];
    for (let index = 0; index < group.length; index += 1)
      consider(key, index, sourceCaps[key]);
  }

  pool.sort(
    (a, b) =>
      b.sourceRank * sourceWeights[b.sourceKey] -
        a.sourceRank * sourceWeights[a.sourceKey] || a.rawItemId - b.rawItemId,
  );
  const domainCounts = new Map<string, number>();
  const ordered: Candidate[] = [];
  const remaining = [...pool];
  for (let allowance = 1; remaining.length; allowance++) {
    for (let index = 0; index < remaining.length;) {
      const candidate = remaining[index];
      const domain = new URL(candidate.originalUrl).hostname.replace(
        /^www\./,
        "",
      );
      const count = domainCounts.get(domain) ?? 0;
      if (count < allowance) {
        ordered.push(candidate);
        domainCounts.set(domain, count + 1);
        remaining.splice(index, 1);
      } else index++;
    }
  }
  return ordered;
}

export async function loadCandidatePool(
  now: Date = new Date(),
  client: Pick<Prisma.TransactionClient, "rawItem"> = getDb(),
): Promise<Candidate[]> {
  const cutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const rows = (
    await Promise.all(
      sourceKeys.map((key) =>
        client.rawItem.findMany({
          where: {
            usedIssueId: null,
            excerpt: { not: "" },
            publishedAt: {
              gte: cutoff,
              lte: new Date(now.getTime() + 300_000),
            },
            fetchedAt: { gte: new Date(now.getTime() - 90 * 60 * 1000) },
            source: { key, enabled: true },
          },
          include: { source: true },
          orderBy: [{ score: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
          take: 60,
        }),
      ),
    )
  ).flat();

  const urls = [...new Set(rows.map((row) => row.normalizedUrl))];
  const used =
    urls.length === 0
      ? []
      : await client.rawItem.findMany({
          where: { normalizedUrl: { in: urls }, usedIssueId: { not: null } },
          select: { normalizedUrl: true },
        });
  return prepareCandidates(
    rows,
    new Set(used.map((row) => row.normalizedUrl)),
    now,
  );
}
