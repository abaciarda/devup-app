import "server-only";
import { editionDateForNow, editionDateKey } from "../../edition-date";
import { getDb } from "../database/client";
import { operationsEnv, isPreviewDeployment } from "./env";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
} from "./lease";
import { refreshSources } from "../sources/refresh";
import { generateIssue } from "../issues/generate";
import { runDelivery } from "../delivery/send";
import { refreshPublishedIssueCache } from "../issues/cache";
import { publishMorningEdition } from "./automatic-publication";
import { inPreparationWindow, publicationTimeReached } from "./schedule";

export { inPreparationWindow } from "./schedule";
export async function runPipeline(
  mode: "prepare" | "delivery" | "confirmations",
  dependencies: {
    now?: () => Date;
    refresh?: typeof refreshSources;
    generate?: typeof generateIssue;
    deliver?: typeof runDelivery;
    refreshCache?: typeof refreshPublishedIssueCache;
  } = {},
) {
  const env = operationsEnv();
  if (env.PIPELINE_ENABLED !== "true" || isPreviewDeployment())
    return { state: "disabled" };
  const lease = await acquirePipelineLease(600);
  if (!lease) return { state: "busy" };
  try {
    const now = (dependencies.now ?? (() => new Date()))();
    if (mode === "confirmations")
      return (dependencies.deliver ?? runDelivery)(
        { mode: "confirmations" },
        lease,
      );
    if (mode === "delivery") {
      if (env.AUTO_PUBLISH_ENABLED === "true" && !publicationTimeReached(now))
        return { state: "outside_window" };
      const publication = await publishMorningEdition(
        lease,
        now,
        dependencies.refreshCache,
      );
      if (publication) return publication;
      await commitUnderPipelineLease(lease, (tx) =>
        tx.issue.updateMany({
          where: {
            publishedAt: { not: null },
            deliveryStartedAt: { not: null },
            deliveryFinishedAt: null,
            editionDate: { lte: editionDateForNow(now) },
            sendLogs: {
              none: {
                OR: [
                  { status: "pending" },
                  { status: "unknown" },
                  { retryable: true },
                  { needsReview: true },
                ],
              },
            },
          },
          data: { deliveryFinishedAt: now },
        }),
      );
      const issue = await getDb().issue.findFirst({
        where: {
          publishedAt: { not: null },
          deliveryFinishedAt: null,
          OR: [
            { deliveryStartedAt: null },
            {
              sendLogs: {
                some: {
                  needsReview: false,
                  OR: [{ status: "pending" }, { retryable: true }],
                },
              },
            },
          ],
          editionDate: { lte: editionDateForNow(now) },
        },
        orderBy: { editionDate: "asc" },
        select: { id: true },
      });
      if (issue)
        return {
          ...(await (dependencies.deliver ?? runDelivery)(
            { mode: "issue", issueId: issue.id },
            lease,
          )),
          issueId: issue.id,
        };
      return (dependencies.deliver ?? runDelivery)({ mode: "retry" }, lease);
    }
    if (!inPreparationWindow(now)) return { state: "outside_window" };
    const backlog = await getDb().issue.findFirst({
      where: {
        publishedAt: { not: null },
        deliveryFinishedAt: null,
        editionDate: { lte: editionDateForNow(now) },
        OR: [
          { deliveryStartedAt: null },
          {
            sendLogs: {
              some: {
                needsReview: false,
                OR: [{ status: "pending" }, { retryable: true }],
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (backlog) return { state: "delivery_pending", issueId: backlog.id };
    const issue = await commitUnderPipelineLease(lease, (tx) =>
      tx.issue.upsert({
        where: { editionDate: editionDateForNow(now) },
        create: { editionDate: editionDateForNow(now) },
        update: {},
      }),
    );
    if (issue.publishedAt || issue.deliveryStartedAt)
      return { state: "published", issueId: issue.id };
    if (issue.generationStatus === "ready")
      return {
        state:
          env.AUTO_PUBLISH_ENABLED === "true"
            ? "prepared"
            : "waiting_for_approval",
        issueId: issue.id,
      };
    if (issue.scheduledGenerationAttempts >= 1)
      return { state: "needs_review", issueId: issue.id };
    const reserved = await commitUnderPipelineLease(lease, (tx) =>
      reserveScheduledGeneration(tx, issue.id),
    );
    if (!reserved) return { state: "needs_review", issueId: issue.id };
    const refreshed = await (dependencies.refresh ?? refreshSources)({ lease });
    if (refreshed.status === "busy") return { state: "busy" };
    if (!refreshed.enoughCandidates) {
      await commitUnderPipelineLease(lease, (tx) =>
        tx.issue.updateMany({
          where: {
            id: issue.id,
            publishedAt: null,
            generationStatus: { not: "ready" },
          },
          data: {
            generationStatus: "failed",
            generationError: "scheduled_insufficient_candidates",
          },
        }),
      );
      return { state: "needs_review", issueId: issue.id };
    }
    const result = await (dependencies.generate ?? generateIssue)({
      lease,
      now: dependencies.now,
    });
    return {
      state:
        result.status === "ready"
          ? env.AUTO_PUBLISH_ENABLED === "true"
            ? "prepared"
            : "waiting_for_approval"
          : result.status === "busy"
            ? "busy"
            : "needs_review",
      issueId: issue.id,
      date: editionDateKey(now),
    };
  } finally {
    await releasePipelineLease(lease);
  }
}

export async function reserveScheduledGeneration(
  tx: import("../../../generated/prisma/client").Prisma.TransactionClient,
  issueId: number,
) {
  const changed = await tx.issue.updateMany({
    where: {
      id: issueId,
      publishedAt: null,
      deliveryStartedAt: null,
      generationStatus: { not: "ready" },
      scheduledGenerationAttempts: 0,
    },
    data: { scheduledGenerationAttempts: { increment: 1 } },
  });
  return changed.count === 1;
}
