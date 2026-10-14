import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { getDb } from "../database/client";
import {
  hasUsefulSourceText,
  isNewsPost,
  normalizeStoryUrl,
} from "./text";
import { sourceKeySchema, type SourceKey } from "../shared/validation";

export const sourceKeys: SourceKey[] = ["hackernews", "devto", "lobsters"];

const rowSchema = z.object({
  id: z.number().int().positive(),
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
      !isNewsPost(row.title, row.tags)
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
  const maxRows = Math.max(
    0,
    ...[...groups.values()].map((group) => group.length),
  );

  for (let index = 0; index < maxRows && pool.length < 18; index += 1) {
    for (const key of sourceKeys) {
      const group = groups.get(key);
      if (!group) continue;
      const row = group[index];
      if (
        !row ||
        (counts.get(key) ?? 0) >= 6 ||
        seenUrls.has(row.normalizedUrl)
      )
        continue;
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
      });
      seenUrls.add(row.normalizedUrl);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return pool;
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
