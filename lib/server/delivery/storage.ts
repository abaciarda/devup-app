import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { frozenEmailSchema, type FrozenEmail } from "../../email/contracts";
import {
  deliveryDecision,
  maxDeliveryAttempts,
  retryWindowMs,
} from "./policy";
import type { ProviderOutcome } from "./resend-provider";

export type DeliveryRef = { kind: "issue" | "confirmation"; id: string };
type State = {
  status: string | null;
  attempts: number;
  retryable: boolean;
  needsReview: boolean;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  providerId: string | null;
  acceptedAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  complainedAt: Date | null;
};
export type StoredDelivery = State &
  DeliveryRef & {
    subscriberId: string;
    sendId: string;
    subscriptionVersion: number;
    message: unknown;
    email: string;
    permitted: boolean;
    expiresAt: Date | null;
    issueId: number | null;
  };
export type ClaimedDelivery = StoredDelivery & {
  message: FrozenEmail;
  firstAttemptAt: Date;
  uncertainBefore: boolean;
};
type Patch = Partial<State> & { error?: string | null };

export async function lockSubscriber(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Subscriber" WHERE "id" = ${id} FOR UPDATE`;
}

export async function readDelivery(
  tx: Prisma.TransactionClient,
  ref: DeliveryRef,
): Promise<StoredDelivery | null> {
  if (ref.kind === "issue") {
    const row = await tx.sendLog.findUnique({
      where: { id: ref.id },
      include: { subscriber: true, issue: { select: { publishedAt: true } } },
    });
    if (!row) return null;
    return {
      ...ref,
      ...row,
      subscriberId: row.subscriberId,
      sendId: row.id,
      message: { payload: row.payload, idempotencyKey: row.idempotencyKey },
      email: row.subscriber.email,
      permitted:
        Boolean(row.issue.publishedAt) &&
        row.subscriber.status === "confirmed" &&
        row.subscriber.subscriptionVersion === row.subscriptionVersion,
      expiresAt: null,
    };
  }
  const row = await tx.subscriber.findUnique({ where: { id: ref.id } });
  if (!row || !row.confirmationSendId) return null;
  return {
    ...ref,
    issueId: null,
    subscriberId: row.id,
    sendId: row.confirmationSendId,
    subscriptionVersion: row.subscriptionVersion,
    message: {
      payload: row.confirmationPayload,
      idempotencyKey: row.confirmationIdempotencyKey,
    },
    email: row.email,
    permitted: row.status === "pending",
    expiresAt: row.confirmationExpiresAt,
    status: row.confirmationStatus,
    attempts: row.confirmationAttempts,
    retryable: row.confirmationRetryable,
    needsReview: row.confirmationNeedsReview,
    firstAttemptAt: row.confirmationFirstAttemptAt,
    lastAttemptAt: row.confirmationLastAttemptAt,
    nextAttemptAt: row.confirmationNextAttemptAt,
    providerId: row.confirmationProviderId,
    acceptedAt: row.confirmationAcceptedAt,
    deliveredAt: row.confirmationDeliveredAt,
    bouncedAt: row.confirmationBouncedAt,
    complainedAt: row.confirmationComplainedAt,
  };
}

export async function patchDelivery(
  tx: Prisma.TransactionClient,
  work: StoredDelivery,
  patch: Patch,
  onlyUnresolved = false,
  attempts?: number,
) {
  if (work.kind === "issue")
    return tx.sendLog.updateMany({
      where: {
        id: work.id,
        ...(attempts === undefined ? {} : { attempts }),
        ...(onlyUnresolved
          ? {
              status: { in: ["pending", "failed", "unknown"] },
              providerId: null,
              bouncedAt: null,
              complainedAt: null,
            }
          : {}),
      },
      data: {
        status: patch.status as
          | "pending"
          | "accepted"
          | "failed"
          | "unknown"
          | "suppressed"
          | undefined,
        attempts: patch.attempts,
        retryable: patch.retryable,
        needsReview: patch.needsReview,
        firstAttemptAt: patch.firstAttemptAt,
        lastAttemptAt: patch.lastAttemptAt,
        nextAttemptAt: patch.nextAttemptAt,
        providerId: patch.providerId,
        acceptedAt: patch.acceptedAt,
        deliveredAt: patch.deliveredAt,
        bouncedAt: patch.bouncedAt,
        complainedAt: patch.complainedAt,
        lastError: patch.error,
      },
    });
  return tx.subscriber.updateMany({
    where: {
      id: work.id,
      confirmationSendId: work.sendId,
      ...(attempts === undefined ? {} : { confirmationAttempts: attempts }),
      ...(onlyUnresolved
        ? {
            confirmationStatus: { in: ["pending", "failed", "unknown"] },
            confirmationProviderId: null,
            confirmationBouncedAt: null,
            confirmationComplainedAt: null,
          }
        : {}),
    },
    data: {
      confirmationStatus: patch.status as
        | "pending"
        | "accepted"
        | "failed"
        | "unknown"
        | "suppressed"
        | undefined,
      confirmationAttempts: patch.attempts,
      confirmationRetryable: patch.retryable,
      confirmationNeedsReview: patch.needsReview,
      confirmationFirstAttemptAt: patch.firstAttemptAt,
      confirmationLastAttemptAt: patch.lastAttemptAt,
      confirmationNextAttemptAt: patch.nextAttemptAt,
      confirmationProviderId: patch.providerId,
      confirmationAcceptedAt: patch.acceptedAt,
      confirmationDeliveredAt: patch.deliveredAt,
      confirmationBouncedAt: patch.bouncedAt,
      confirmationComplainedAt: patch.complainedAt,
      confirmationError: patch.error,
    },
  });
}

export async function claimDeliveryInTransaction(
  tx: Prisma.TransactionClient,
  ref: DeliveryRef,
  now = new Date(),
): Promise<ClaimedDelivery | null> {
  const preliminary = await readDelivery(tx, ref);
  if (!preliminary) return null;
  await lockSubscriber(tx, preliminary.subscriberId);
  if (ref.kind === "issue")
    await tx.$queryRaw`SELECT "id" FROM "SendLog" WHERE "id" = ${ref.id} FOR UPDATE`;
  const work = await readDelivery(tx, ref);
  if (
    !work ||
    work.needsReview ||
    work.providerId ||
    !["pending", "failed", "unknown"].includes(work.status ?? "")
  )
    return null;
  const uncertainBefore =
    work.status === "unknown" ||
    (work.status === "pending" && work.attempts > 0);
  if (uncertainBefore && !work.firstAttemptAt) {
    await patchDelivery(tx, work, {
      status: "unknown",
      retryable: false,
      needsReview: true,
      nextAttemptAt: null,
      error: "missing_attempt_time",
    });
    return null;
  }
  if (!work.permitted || (work.expiresAt && work.expiresAt <= now)) {
    await patchDelivery(tx, work, {
      status: uncertainBefore ? "unknown" : "suppressed",
      retryable: false,
      needsReview: uncertainBefore,
      nextAttemptAt: null,
      error: work.permitted ? "confirmation_expired" : "permission_revoked",
    });
    return null;
  }
  if (work.nextAttemptAt && work.nextAttemptAt > now) return null;
  if (
    (work.status === "failed" && !work.retryable) ||
    (work.status === "unknown" && !work.retryable)
  )
    return null;
  if (
    work.attempts >= maxDeliveryAttempts ||
    (work.firstAttemptAt &&
      now.getTime() >= work.firstAttemptAt.getTime() + retryWindowMs)
  ) {
    await patchDelivery(tx, work, {
      status: uncertainBefore ? "unknown" : "failed",
      retryable: false,
      needsReview: uncertainBefore,
      nextAttemptAt: null,
      error: "retry_window_closed",
    });
    return null;
  }
  const parsed = frozenEmailSchema.safeParse(work.message);
  if (
    !parsed.success ||
    parsed.data.idempotencyKey !== `${work.kind}/${work.sendId}` ||
    parsed.data.payload.to[0] !== work.email ||
    parsed.data.payload.tags[0].value !== work.sendId ||
    parsed.data.payload.tags[1].value !== work.kind
  ) {
    await patchDelivery(tx, work, {
      status: uncertainBefore ? "unknown" : "failed",
      retryable: false,
      needsReview: true,
      nextAttemptAt: null,
      error: "invalid_frozen_payload",
    });
    return null;
  }
  const firstAttemptAt = work.firstAttemptAt ?? now;
  const attempts = work.attempts + 1;
  const changed = await patchDelivery(
    tx,
    work,
    {
      status: "unknown",
      attempts,
      firstAttemptAt,
      lastAttemptAt: now,
      retryable: true,
      nextAttemptAt: new Date(now.getTime() + 60_000),
      error: "attempt_in_progress",
    },
    true,
    work.attempts,
  );
  if (!changed.count) return null;
  if (work.kind === "confirmation")
    await tx.confirmationSend.upsert({
      where: { id: work.sendId },
      create: {
        id: work.sendId,
        subscriberId: work.subscriberId,
        firstAttemptAt,
      },
      update: {},
    });
  return {
    ...work,
    message: parsed.data,
    firstAttemptAt,
    attempts,
    uncertainBefore,
  };
}

export async function recordDeliveryOutcome(
  tx: Prisma.TransactionClient,
  work: ClaimedDelivery,
  outcome: ProviderOutcome,
  now = new Date(),
) {
  await lockSubscriber(tx, work.subscriberId);
  const decision = deliveryDecision(
    outcome,
    work.attempts,
    work.firstAttemptAt,
    work.uncertainBefore,
    now,
  );
  const current = await readDelivery(tx, work);
  if (work.kind === "confirmation" && outcome.kind === "accepted")
    await tx.confirmationSend.updateMany({
      where: { id: work.sendId, providerId: null },
      data: { providerId: outcome.providerId, acceptedAt: now },
    });
  if (outcome.kind !== "accepted" && current && !current.permitted) {
    decision.retryable = false;
    decision.nextAttemptAt = null;
    decision.needsReview = decision.status === "unknown";
  }
  return patchDelivery(tx, work, decision, true, work.attempts);
}

export async function suppressSubscriberInTransaction(
  tx: Prisma.TransactionClient,
  subscriberId: string,
  reason: string,
  now = new Date(),
) {
  await lockSubscriber(tx, subscriberId);
  const subscriber = await tx.subscriber.findUnique({
    where: { id: subscriberId },
  });
  if (!subscriber) return;
  if (subscriber.status !== "suppressed")
    await tx.subscriber.update({
      where: { id: subscriberId },
      data: {
        status: "suppressed",
        subscriptionVersion: { increment: 1 },
        suppressedAt: now,
        suppressionReason: z.string().max(100).parse(reason),
        confirmationTokenHash: null,
        confirmationExpiresAt: null,
        confirmationRetryable: false,
        confirmationNextAttemptAt: null,
      },
    });
  await tx.sendLog.updateMany({
    where: {
      subscriberId,
      providerId: null,
      status: { in: ["pending", "failed"] },
    },
    data: {
      status: "suppressed",
      retryable: false,
      nextAttemptAt: null,
      lastError: "address_suppressed",
    },
  });
  await tx.sendLog.updateMany({
    where: { subscriberId, status: "unknown" },
    data: {
      retryable: false,
      needsReview: true,
      nextAttemptAt: null,
      lastError: "address_suppressed",
    },
  });
  await tx.subscriber.updateMany({
    where: { id: subscriberId, confirmationStatus: "unknown" },
    data: {
      confirmationRetryable: false,
      confirmationNeedsReview: true,
      confirmationNextAttemptAt: null,
    },
  });
  await tx.subscriber.updateMany({
    where: {
      id: subscriberId,
      confirmationProviderId: null,
      confirmationStatus: { in: ["pending", "failed"] },
    },
    data: {
      confirmationStatus: "suppressed",
      confirmationRetryable: false,
      confirmationNeedsReview: false,
      confirmationNextAttemptAt: null,
    },
  });
}

export async function finishIssueDelivery(
  tx: Prisma.TransactionClient,
  issueId: number,
  now = new Date(),
) {
  const outstanding = await tx.sendLog.count({
    where: {
      issueId,
      OR: [
        { status: "pending" },
        { status: "unknown" },
        { retryable: true },
        { needsReview: true },
      ],
    },
  });
  if (!outstanding)
    await tx.issue.updateMany({
      where: {
        id: issueId,
        deliveryStartedAt: { not: null },
        deliveryFinishedAt: null,
      },
      data: { deliveryFinishedAt: now },
    });
}
