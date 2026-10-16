import "server-only";
import { editionDateForNow } from "../../edition-date";
import { getDb } from "../database/client";
import { deliveryEnv } from "../delivery/env";
import { isPreviewDeployment, operationsEnv } from "./env";
import { evaluateDailyHealth } from "./health-status";

export async function dailyHealth(now = new Date()) {
  if (isPreviewDeployment())
    return { state: "disabled" as const, problems: [] };
  const env = operationsEnv();
  const db = getDb();
  const { issue, rows } = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const issue = await tx.issue.findUnique({
        where: { editionDate: editionDateForNow(now) },
        select: {
          id: true,
          publishedAt: true,
          deliveryStartedAt: true,
          deliveryFinishedAt: true,
          generationStatus: true,
          generationError: true,
        },
      });
      const rows = issue
        ? await tx.sendLog.groupBy({
            by: ["status", "needsReview", "retryable"],
            where: { issueId: issue.id },
            _count: { _all: true },
          })
        : [];
      return { issue, rows };
    },
    { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 10000 },
  );
  let recipients = 0;
  let accepted = 0;
  let unresolved = 0;
  for (const row of rows) {
    recipients += row._count._all;
    if (row.status === "accepted") accepted += row._count._all;
    if (
      row.needsReview ||
      row.retryable ||
      row.status === "unknown" ||
      row.status === "failed"
    )
      unresolved += row._count._all;
  }
  return evaluateDailyHealth({
    now,
    issue,
    recipients,
    accepted,
    unresolved,
    pipelineEnabled: env.PIPELINE_ENABLED === "true",
    autoPublishEnabled: env.AUTO_PUBLISH_ENABLED === "true",
    deliveryEnabled: deliveryEnv().EMAIL_DELIVERY_ENABLED === "true",
  });
}
