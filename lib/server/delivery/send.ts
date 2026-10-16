import "server-only";
import { z } from "zod";
import { getDb } from "../database/client";
import { deliveryEnv } from "./env";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
  type PipelineLease,
} from "../operations/lease";
import { resendProvider } from "./resend-provider";
import { snapshotPublishedIssue } from "./snapshot";
import {
  claimDeliveryInTransaction,
  readDelivery,
  recordDeliveryOutcome,
  finishIssueDelivery,
  type DeliveryRef,
} from "./storage";
import { consumeRateLimit } from "../shared/rate-limit";
import { providerCooldown, saveProviderCooldown } from "./cooldown";

export const deliveryRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("issue"),
    issueId: z.number().int().positive().max(2_147_483_647),
  }),
  z.object({ mode: z.literal("confirmations"), sendId: z.uuid().optional() }),
  z.object({ mode: z.literal("retry") }),
]);
export type DeliveryRequest = z.infer<typeof deliveryRequestSchema>;
export async function runDelivery(
  value: DeliveryRequest,
  ownedLease?: PipelineLease,
) {
  const request = deliveryRequestSchema.parse(value);
  const env = deliveryEnv();
  if (env.EMAIL_DELIVERY_ENABLED !== "true")
    return { state: "disabled" as const, attempted: 0 };
  const lease = ownedLease ?? (await acquirePipelineLease(600));
  if (!lease) return { state: "busy" as const, attempted: 0 };
  const startedAt = Date.now();
  let attempted = 0;
  let dailyLimitReached = false;
  try {
    if (request.mode === "issue")
      await snapshotPublishedIssue(request.issueId, lease);
    if (await providerCooldown())
      return { state: "provider_backoff" as const, attempted: 0 };
    const db = getDb();
    const now = new Date();
    const confirmationWhere =
      request.mode === "confirmations" && request.sendId
        ? { confirmationSendId: request.sendId }
        : {};
    const refs: DeliveryRef[] = [];
    if (request.mode !== "issue") {
      const rows = await db.subscriber.findMany({
        where: {
          confirmationSendId: { not: null },
          ...confirmationWhere,
          confirmationNeedsReview: false,
          OR: [
            { confirmationStatus: "pending" },
            { confirmationStatus: "failed", confirmationRetryable: true },
            { confirmationStatus: "unknown", confirmationRetryable: true },
          ],
          AND: [
            {
              OR: [
                { confirmationNextAttemptAt: null },
                { confirmationNextAttemptAt: { lte: now } },
              ],
            },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { id: true },
      });
      refs.push(
        ...rows.map((row) => ({ kind: "confirmation" as const, id: row.id })),
      );
    }
    if (request.mode !== "confirmations") {
      const rows = await db.sendLog.findMany({
        where: {
          ...(request.mode === "issue" ? { issueId: request.issueId } : {}),
          needsReview: false,
          OR: [
            { status: "pending" },
            { status: "failed", retryable: true },
            { status: "unknown", retryable: true },
          ],
          AND: [
            { OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
          ],
        },
        orderBy: { createdAt: "asc" },
        take: 10,
        select: { id: true },
      });
      refs.push(...rows.map((row) => ({ kind: "issue" as const, id: row.id })));
    }
    const provider = resendProvider(env.RESEND_API_KEY!);
    for (const ref of refs) {
      if (attempted >= 10 || Date.now() - startedAt > 30_000) break;
      const work = await commitUnderPipelineLease(lease, async (tx) => {
        const limit = await consumeRateLimit(
          {
            key: `email:daily-attempts:${new Date().toISOString().slice(0, 10)}`,
            limit: env.EMAIL_DAILY_LIMIT,
            windowSeconds: 86400,
          },
          tx,
        );
        if (!limit.allowed) {
          dailyLimitReached = true;
          return null;
        }
        return claimDeliveryInTransaction(tx, ref);
      });
      if (!work) {
        if (dailyLimitReached) break;
        continue;
      }
      const rate = await consumeRateLimit({
        key: "email:provider-second",
        limit: 1,
        windowSeconds: 1,
      });
      if (!rate.allowed) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(1000, rate.retryAfterSeconds * 1000)),
        );
      }
      const permitted = await commitUnderPipelineLease(lease, (tx) =>
        readDelivery(tx, ref),
      );
      if (
        !permitted?.permitted ||
        permitted.sendId !== work.sendId ||
        permitted.providerId ||
        permitted.status !== "unknown" ||
        (permitted.expiresAt && permitted.expiresAt <= new Date())
      )
        continue;
      const outcome = await provider(work.message);
      attempted++;
      await commitUnderPipelineLease(lease, async (tx) => {
        await recordDeliveryOutcome(tx, work, outcome);
        if (
          outcome.kind !== "accepted" &&
          outcome.code === "provider_rate_limit"
        )
          await saveProviderCooldown(tx, outcome.retryAfter);
      });
      if (work.issueId)
        await commitUnderPipelineLease(lease, (tx) =>
          finishIssueDelivery(tx, work.issueId!),
        );
      if (outcome.kind !== "accepted" && outcome.code === "provider_rate_limit")
        break;
    }
    if (request.mode === "issue")
      await commitUnderPipelineLease(lease, (tx) =>
        finishIssueDelivery(tx, request.issueId),
      );
    const issueWhere =
      request.mode === "issue" ? { issueId: request.issueId } : {};
    const [
      pendingIssues,
      retryIssues,
      reviewIssues,
      pendingConfirmations,
      retryConfirmations,
      reviewConfirmations,
    ] = await Promise.all([
      request.mode === "confirmations"
        ? 0
        : db.sendLog.count({ where: { ...issueWhere, status: "pending" } }),
      request.mode === "confirmations"
        ? 0
        : db.sendLog.count({ where: { ...issueWhere, retryable: true } }),
      request.mode === "confirmations"
        ? 0
        : db.sendLog.count({ where: { ...issueWhere, needsReview: true } }),
      request.mode === "issue"
        ? 0
        : db.subscriber.count({
            where: {
              ...confirmationWhere,
              confirmationStatus: "pending",
              confirmationNeedsReview: false,
            },
          }),
      request.mode === "issue"
        ? 0
        : db.subscriber.count({
            where: { ...confirmationWhere, confirmationRetryable: true },
          }),
      request.mode === "issue"
        ? 0
        : db.subscriber.count({
            where: { ...confirmationWhere, confirmationNeedsReview: true },
          }),
    ]);
    const state = dailyLimitReached
      ? ("daily_limit" as const)
      : reviewIssues + reviewConfirmations > 0
        ? ("needs_review" as const)
        : pendingIssues + pendingConfirmations > 0
          ? ("progress" as const)
          : retryIssues + retryConfirmations > 0
            ? ("retry_scheduled" as const)
            : ("complete" as const);
    return { state, attempted };
  } finally {
    if (!ownedLease) await releasePipelineLease(lease);
  }
}
