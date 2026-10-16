import { morningDeliveryOverdue } from "./schedule";

export const healthProblemCodes = [
  "pipeline_disabled",
  "automatic_publication_disabled",
  "email_sending_disabled",
  "missing_edition",
  "draft_needs_review",
  "edition_not_published",
  "sending_not_started",
  "delivery_needs_review",
  "delivery_incomplete",
] as const;

type IssueHealth = {
  publishedAt: Date | null;
  deliveryStartedAt: Date | null;
  deliveryFinishedAt: Date | null;
  generationStatus: string;
  generationError: string | null;
};

export function evaluateDailyHealth({
  now,
  issue,
  recipients,
  accepted,
  unresolved,
  pipelineEnabled,
  autoPublishEnabled,
  deliveryEnabled,
}: {
  now: Date;
  issue: IssueHealth | null;
  recipients: number;
  accepted: number;
  unresolved: number;
  pipelineEnabled: boolean;
  autoPublishEnabled: boolean;
  deliveryEnabled: boolean;
}) {
  const problems: (typeof healthProblemCodes)[number][] = [];
  if (!morningDeliveryOverdue(now))
    return { state: "healthy" as const, problems };
  if (!pipelineEnabled) problems.push("pipeline_disabled");
  if (!autoPublishEnabled) problems.push("automatic_publication_disabled");
  if (!deliveryEnabled) problems.push("email_sending_disabled");
  if (!issue) problems.push("missing_edition");
  else {
    if (issue.generationError || issue.generationStatus === "failed")
      problems.push("draft_needs_review");
    if (!issue.publishedAt) problems.push("edition_not_published");
    else if (!issue.deliveryStartedAt) problems.push("sending_not_started");
    else {
      if (unresolved) problems.push("delivery_needs_review");
      if (!issue.deliveryFinishedAt || accepted !== recipients)
        problems.push("delivery_incomplete");
    }
  }
  return {
    state: problems.length ? ("attention" as const) : ("healthy" as const),
    problems,
  };
}
