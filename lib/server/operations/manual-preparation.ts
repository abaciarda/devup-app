import "server-only";
import { editionDateForNow } from "../../edition-date";
import { getDb } from "../database/client";
import { generateIssue } from "../issues/generate";
import { refreshSources } from "../sources/refresh";
import { isPreviewDeployment } from "./env";
import { acquirePipelineLease, releasePipelineLease } from "./lease";

export async function prepareManualDraft(
  dependencies: {
    now?: () => Date;
    refresh?: typeof refreshSources;
    generate?: typeof generateIssue;
  } = {},
) {
  if (isPreviewDeployment()) return { state: "disabled" as const };
  const lease = await acquirePipelineLease(600);
  if (!lease) return { state: "busy" as const };
  try {
    const now = (dependencies.now ?? (() => new Date()))();
    const issue = await getDb().issue.findUnique({
      where: { editionDate: editionDateForNow(now) },
      select: {
        id: true,
        publishedAt: true,
        deliveryStartedAt: true,
        deliveryFinishedAt: true,
        generationStatus: true,
      },
    });
    if (
      issue &&
      (issue.publishedAt || issue.deliveryStartedAt || issue.deliveryFinishedAt)
    )
      return { state: "published" as const, issueId: issue.id };
    if (issue?.generationStatus === "ready")
      return { state: "already_ready" as const, issueId: issue.id };
    const refreshed = await (dependencies.refresh ?? refreshSources)({ lease });
    if (refreshed.status === "busy") return { state: "busy" as const };
    if (!refreshed.enoughCandidates)
      return { state: "insufficient_candidates" as const };
    const result = await (dependencies.generate ?? generateIssue)({
      lease,
      now: dependencies.now,
    });
    if (result.status === "busy") return { state: "busy" as const };
    if (result.status === "locked")
      return { state: "published" as const, issueId: result.issueId };
    if (result.status === "ready")
      return { state: "ready" as const, issueId: result.issueId };
    return { state: "generation_failed" as const, issueId: result.issueId };
  } finally {
    await releasePipelineLease(lease);
  }
}
