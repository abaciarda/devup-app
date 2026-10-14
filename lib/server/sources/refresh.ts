import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import {
  loadCandidatePool,
  minimumEditionStories,
  sourceKeys,
} from "./candidates";
import { getDb } from "../database/client";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
  type PipelineLease,
} from "../operations/lease";
import { fetchSource, type SourceBatch, type SourceContext } from "./adapters";
import { sourceErrorCode } from "./http";
import { normalizeStoryUrl } from "./text";
import { rawItemInputSchema, type SourceKey } from "../shared/validation";

const configSchema = z.strictObject({
  limit: z.number().int().min(1).max(40).optional(),
});

export const defaultSourceLimits: Record<SourceKey, number> = {
  hackernews: 30,
  lobsters: 20,
  devto: 15,
};

export type PersistResult = {
  inserted: number;
  updated: number;
  preserved: number;
  removed: number;
  disabled: boolean;
};

export async function persistSourceBatch(
  tx: Prisma.TransactionClient,
  key: SourceKey,
  batch: Pick<SourceBatch, "items" | "retiredExternalIds">,
  now: Date,
): Promise<PersistResult> {
  z.date().parse(now);
  const source = await tx.source.findUniqueOrThrow({ where: { key } });
  const result: PersistResult = {
    inserted: 0,
    updated: 0,
    preserved: 0,
    removed: 0,
    disabled: !source.enabled,
  };
  if (!source.enabled) return result;

  const retired = z
    .array(z.string().min(1).max(200))
    .max(40)
    .parse(batch.retiredExternalIds);
  const withdrawn = new Set(retired);
  result.removed = (
    await tx.rawItem.deleteMany({
      where: {
        sourceId: source.id,
        externalId: { in: retired },
        usedIssueId: null,
      },
    })
  ).count;

  for (const value of batch.items) {
    const item = rawItemInputSchema.parse(value);
    if (item.sourceKey !== key || withdrawn.has(item.externalId)) {
      throw new Error(
        "Source batch contains mismatched or conflicting identities",
      );
    }
    const where = {
      sourceId_externalId: { sourceId: source.id, externalId: item.externalId },
    };
    const previous = await tx.rawItem.findUnique({ where });
    if (previous && previous.usedIssueId !== null) {
      result.preserved += 1;
      continue;
    }

    const fields = {
      title: item.title,
      originalUrl: item.originalUrl,
      normalizedUrl: normalizeStoryUrl(item.originalUrl),
      excerpt: item.excerpt,
      publishedAt: item.publishedAt,
      fetchedAt: now,
      score: item.score,
      tags: item.tags,
    };
    await tx.rawItem.upsert({
      where,
      create: { sourceId: source.id, externalId: item.externalId, ...fields },
      update: fields,
    });
    if (previous) result.updated += 1;
    else result.inserted += 1;
  }
  return result;
}

export type SourceReport = {
  sourceKey: SourceKey;
  status: "ok" | "partial" | "failed" | "disabled";
  listed: number;
  received: number;
  rejected: number;
  inserted: number;
  updated: number;
  preserved: number;
  removed: number;
  errors: string[];
  exclusions?: Record<string, number>;
};

export type RefreshResult =
  | { status: "busy" }
  | {
      status: "complete";
      sources: SourceReport[];
      candidateCount: number;
      enoughCandidates: boolean;
    };

export async function refreshSources(
  options: Pick<SourceContext, "fetcher" | "pause" | "articleReader"> & {
    lease?: PipelineLease;
  } = {},
): Promise<RefreshResult> {
  const lease = options.lease ?? (await acquirePipelineLease());
  if (!lease) return { status: "busy" };

  try {
    const db = getDb();
    const now = new Date();
    const deadline = AbortSignal.timeout(120_000);
    const sources = await db.source.findMany({
      where: { key: { in: sourceKeys } },
    });

    const fetched = await Promise.all(
      sourceKeys.map(async (key) => {
        const report: SourceReport = {
          sourceKey: key,
          status: "ok",
          listed: 0,
          received: 0,
          rejected: 0,
          inserted: 0,
          updated: 0,
          preserved: 0,
          removed: 0,
          errors: [],
        };
        const source = sources.find((row) => row.key === key);
        if (!source || !source.enabled) {
          report.status = source ? "disabled" : "failed";
          if (!source) report.errors.push("missing_source_setting");
          return { report, batch: null };
        }
        const config = configSchema.safeParse(source.config);
        if (!config.success) {
          report.status = "failed";
          report.errors.push("invalid_source_config");
          return { report, batch: null };
        }
        try {
          const batch = await fetchSource(
            key,
            config.data.limit ?? defaultSourceLimits[key],
            {
              fetcher: options.fetcher,
              pause: options.pause,
              articleReader: options.articleReader,
              now,
              signal: AbortSignal.any([deadline, AbortSignal.timeout(75_000)]),
            },
          );
          report.listed = batch.listed;
          report.received = batch.items.length;
          report.rejected = batch.rejected;
          report.errors = batch.errors;
          report.exclusions = batch.exclusions;
          if (batch.errors.length > 0) report.status = "partial";
          return { report, batch };
        } catch (error) {
          report.status = "failed";
          report.errors.push(sourceErrorCode(error));
          return { report, batch: null };
        }
      }),
    );

    for (const { report, batch } of fetched) {
      if (!batch) continue;
      const chunks = Math.max(1, Math.ceil(batch.items.length / 4));
      for (let index = 0; index < chunks; index += 1) {
        deadline.throwIfAborted();
        const persisted = await commitUnderPipelineLease(lease, (tx) =>
          persistSourceBatch(
            tx,
            report.sourceKey,
            {
              items: batch.items.slice(index * 4, index * 4 + 4),
              retiredExternalIds: index === 0 ? batch.retiredExternalIds : [],
            },
            new Date(),
          ),
        );
        if (persisted.disabled) {
          report.status = "disabled";
          break;
        }
        report.inserted += persisted.inserted;
        report.updated += persisted.updated;
        report.preserved += persisted.preserved;
        report.removed += persisted.removed;
      }
    }

    deadline.throwIfAborted();
    const pool = await loadCandidatePool(new Date());
    return {
      status: "complete",
      sources: fetched.map((entry) => entry.report),
      candidateCount: pool.length,
      enoughCandidates: pool.length >= minimumEditionStories,
    };
  } finally {
    if (!options.lease) await releasePipelineLease(lease);
  }
}
