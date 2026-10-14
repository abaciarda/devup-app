import "server-only";
import { Prisma } from "../../generated/prisma/client";
import { operationsEnv, isPreviewDeployment } from "./operations-env";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
} from "./pipeline-lease";

export const retentionDays = {
  unusedSources: 14,
  unattemptedPending: 30,
  expiredConfirmation: 7,
  emailPayloads: 90,
  expiredCounters: 1,
} as const;
export async function cleanupInTransaction(
  tx: Prisma.TransactionClient,
  now = new Date(),
  apply = false,
) {
  const before = (days: number) => new Date(now.getTime() - days * 86400_000);
  const [counters, sources, confirmations, payloads, pending] =
    await Promise.all([
      tx.rateLimit.findMany({
        where: { expiresAt: { lt: before(1) } },
        select: { key: true },
        take: 100,
      }),
      tx.rawItem.findMany({
        where: { usedIssueId: null, fetchedAt: { lt: before(14) } },
        select: { id: true },
        take: 100,
      }),
      tx.subscriber.findMany({
        where: {
          confirmationTokenHash: { not: null },
          confirmationExpiresAt: { lt: before(7) },
          confirmationNeedsReview: false,
          OR: [
            { confirmationAttempts: 0 },
            {
              confirmationStatus: { in: ["accepted", "failed", "suppressed"] },
              confirmationRetryable: false,
            },
          ],
        },
        select: { id: true, confirmationSendId: true, updatedAt: true },
        take: 100,
      }),
      tx.sendLog.findMany({
        where: {
          status: { in: ["accepted", "failed", "suppressed"] },
          retryable: false,
          needsReview: false,
          updatedAt: { lt: before(90) },
          NOT: { payload: { equals: { version: 1, redacted: true } } },
        },
        select: { id: true, updatedAt: true },
        take: 100,
      }),
      tx.subscriber.findMany({
        where: {
          status: "pending",
          confirmationAttempts: 0,
          confirmationNeedsReview: false,
          updatedAt: { lt: before(30) },
          confirmationExpiresAt: { lt: now },
          sendLogs: { none: {} },
          confirmationSends: { none: {} },
        },
        select: { id: true, updatedAt: true },
        take: 100,
      }),
    ]);
  const counts = {
    counters: counters.length,
    unusedSources: sources.length,
    expiredConfirmations: confirmations.length,
    emailPayloads: payloads.length,
    unattemptedPending: pending.length,
  };
  if (!apply)
    return {
      state: "preview" as const,
      counts,
      limited: Object.values(counts).some((count) => count === 100),
    };
  counts.counters = (
    await tx.rateLimit.deleteMany({
      where: {
        key: { in: counters.map((row) => row.key) },
        expiresAt: { lt: before(1) },
      },
    })
  ).count;
  counts.unusedSources = (
    await tx.rawItem.deleteMany({
      where: {
        id: { in: sources.map((row) => row.id) },
        usedIssueId: null,
        fetchedAt: { lt: before(14) },
      },
    })
  ).count;
  counts.unattemptedPending = (
    await tx.subscriber.deleteMany({
      where: {
        OR: pending.map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
        status: "pending",
        confirmationAttempts: 0,
        confirmationNeedsReview: false,
        confirmationExpiresAt: { lt: now },
        sendLogs: { none: {} },
        confirmationSends: { none: {} },
      },
    })
  ).count;
  counts.expiredConfirmations = (
    await tx.subscriber.updateMany({
      where: {
        OR: confirmations.map((row) => ({
          id: row.id,
          updatedAt: row.updatedAt,
          confirmationSendId: row.confirmationSendId,
        })),
        confirmationExpiresAt: { lt: before(7) },
        confirmationNeedsReview: false,
      },
      data: {
        confirmationTokenHash: null,
        confirmationIssuedAt: null,
        confirmationPayload: Prisma.DbNull,
        confirmationRetryable: false,
        confirmationNextAttemptAt: null,
        confirmationStatus: "suppressed",
      },
    })
  ).count;
  counts.emailPayloads = (
    await tx.sendLog.updateMany({
      where: {
        OR: payloads.map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
        status: { in: ["accepted", "failed", "suppressed"] },
        retryable: false,
        needsReview: false,
      },
      data: { payload: { version: 1, redacted: true } },
    })
  ).count;
  return {
    state: "complete" as const,
    counts,
    limited: [counters, sources, confirmations, payloads, pending].some(
      (rows) => rows.length === 100,
    ),
  };
}

export async function runCleanup(apply = false) {
  const env = operationsEnv();
  if (isPreviewDeployment() || (apply && env.CLEANUP_ENABLED !== "true"))
    return { state: "disabled" as const };
  const lease = await acquirePipelineLease(600);
  if (!lease) return { state: "busy" as const };
  try {
    return await commitUnderPipelineLease(lease, async (tx) => {
      const now = new Date();
      const result = await cleanupInTransaction(tx, now, apply);
      if (apply)
        await tx.cleanupRun.upsert({
          where: {
            date: new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`),
          },
          create: {
            date: new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`),
            startedAt: now,
            finishedAt: now,
            counts: result.counts,
          },
          update: { startedAt: now, finishedAt: now, counts: result.counts },
        });
      return result;
    });
  } finally {
    await releasePipelineLease(lease);
  }
}
