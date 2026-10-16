import { morningDeliveryOverdue, publicationTimeReached } from "./schedule";

type MorningIssue = {
  generationStatus: string;
  generationError: string | null;
  publishedAt: Date | null;
  deliveryStartedAt: Date | null;
  deliveryFinishedAt: Date | null;
};

export type MorningCounts = {
  recipients: number;
  accepted: number;
  delivered: number;
  pending: number;
  failed: number;
  unknown: number;
  suppressed: number;
  needsReview: number;
};

export function morningStatus(
  issue: MorningIssue | null,
  counts: MorningCounts,
  now: Date,
) {
  const overdue = morningDeliveryOverdue(now);
  if (
    counts.needsReview ||
    counts.failed ||
    counts.unknown ||
    counts.suppressed
  )
    return {
      tone: "warning" as const,
      label: "Delivery needs attention",
      description:
        "Some recipient sends failed, were suppressed, or have an uncertain outcome. Review delivery records before retrying.",
    };
  if (issue?.deliveryFinishedAt) {
    if (!counts.recipients)
      return {
        tone: "warning" as const,
        label: "No recipients captured",
        description:
          "Delivery was closed with no recipient records. No newsletter email was queued for this edition.",
      };
    if (counts.accepted === counts.recipients)
      return {
        tone: "success" as const,
        label: "Accepted by email provider",
        description:
          "All recipient messages were accepted. Inbox delivery is tracked separately below. Scheduled runs will not resend this edition.",
      };
    return {
      tone: "warning" as const,
      label: "Check delivery records",
      description:
        "Delivery is marked finished, but not every recipient has an accepted message. Inspect the records before taking action.",
    };
  }
  if (issue?.deliveryStartedAt)
    return {
      tone: overdue ? ("warning" as const) : ("blue" as const),
      label: overdue ? "Morning delivery is late" : "Delivery in progress",
      description:
        "The recipient list is captured, but sending is not finished. Eligible messages can resume on the next scheduled run or from Email delivery.",
    };
  if (issue?.generationError || issue?.generationStatus === "failed")
    return {
      tone: "warning" as const,
      label: "Draft needs review",
      description:
        "Preparation or publication reported a problem. Open today's edition to review it; failed drafts are not published automatically.",
    };
  if (overdue)
    return {
      tone: "warning" as const,
      label: "Morning send has not started",
      description:
        "The 07:00 target plus 15-minute grace period has passed without a recipient snapshot. Check the workflow and edition. A published web page alone does not mean email was sent.",
    };
  return {
    tone: "blue" as const,
    label: issue?.publishedAt
      ? "Published, awaiting email send"
      : issue?.generationStatus === "ready"
        ? "Draft ready"
        : publicationTimeReached(now)
          ? "Awaiting morning preparation"
          : "Scheduled for this morning",
    description:
      "Preparation opens at 06:30 and publication at 07:00, Europe/Istanbul. The GitHub schedule can run late; these are target times, not inbox delivery guarantees.",
  };
}
