import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { FrozenEmail } from "../email/contracts";
import { frozenEmailSchema } from "../email/contracts";
import { issueContentSchema } from "../../types/issue-content";
import { getDb } from "./db";
import { emailEnv } from "./email-env";
import { subscriptionEnv } from "./subscription-env";
import { createSubscriberLink } from "./subscriber-links";
import { commitUnderPipelineLease, type PipelineLease } from "./pipeline-lease";

export type SnapshotEntry = {
  id: string;
  subscriberId: string;
  subscriptionVersion: number;
  language: "en" | "tr";
  message: FrozenEmail;
};
export async function saveDeliverySnapshot(
  tx: Prisma.TransactionClient,
  issueId: number,
  capturedAt: Date,
  entries: SnapshotEntry[],
) {
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: issueId } });
  if (!issue.publishedAt) throw new Error("Publish the issue before delivery");
  if (issue.deliveryStartedAt) return false;
  if (entries.length > 200 || (await tx.sendLog.count({ where: { issueId } })))
    throw new Error("Snapshot requires review");
  const current = await tx.subscriber.findMany({
    where: {
      id: { in: entries.map((entry) => entry.subscriberId) },
      status: "confirmed",
      confirmedAt: { lte: capturedAt },
    },
    select: { id: true, email: true, subscriptionVersion: true },
  });
  const valid = entries.filter((entry) =>
    current.some(
      (row) =>
        row.id === entry.subscriberId &&
        row.subscriptionVersion === entry.subscriptionVersion &&
        row.email === entry.message.payload.to[0],
    ),
  );
  const changed = await tx.issue.updateMany({
    where: { id: issueId, publishedAt: { not: null }, deliveryStartedAt: null },
    data: {
      deliveryStartedAt: capturedAt,
      deliveryFinishedAt: valid.length ? null : capturedAt,
    },
  });
  if (!changed.count) return false;
  await tx.sendLog.createMany({
    data: valid.map((entry) => {
      const message = frozenEmailSchema.parse(entry.message);
      if (
        message.idempotencyKey !== `issue/${entry.id}` ||
        message.payload.tags[0].value !== entry.id ||
        message.payload.tags[1].value !== "issue"
      )
        throw new Error("Snapshot payload mismatch");
      return {
        id: entry.id,
        issueId,
        subscriberId: entry.subscriberId,
        subscriptionVersion: entry.subscriptionVersion,
        language: entry.language,
        payload: message.payload,
        idempotencyKey: message.idempotencyKey,
      };
    }),
  });
  return true;
}

export async function snapshotPublishedIssue(
  issueId: number,
  lease: PipelineLease,
) {
  const db = getDb();
  const issue = await db.issue.findUniqueOrThrow({ where: { id: issueId } });
  if (!issue.publishedAt) throw new Error("Publish the issue before delivery");
  if (issue.deliveryStartedAt) return;
  const content = issueContentSchema.parse(issue.content);
  const capturedAt = new Date();
  const subscribers = await db.subscriber.findMany({
    where: { status: "confirmed", confirmedAt: { lte: capturedAt } },
    orderBy: { id: "asc" },
    take: 201,
    select: {
      id: true,
      email: true,
      subscriptionVersion: true,
      language: true,
    },
  });
  if (subscribers.length > 200)
    throw new Error(
      "Recipient snapshot limit exceeded; review capacity before sending",
    );
  const settings = emailEnv();
  const links = subscriptionEnv();
  const { renderDigestEmail } = await import("../email/render");
  const entries: SnapshotEntry[] = [];
  for (const subscriber of subscribers) {
    if (Date.now() - capturedAt.getTime() > 20_000)
      throw new Error("Snapshot rendering budget exceeded; nothing was queued");
    const id = randomUUID();
    const message = await renderDigestEmail(
      {
        sendId: id,
        email: subscriber.email,
        language: subscriber.language,
        issue: {
          id: issue.id,
          date: issue.editionDate.toISOString().slice(0, 10),
          publishedAt: issue.publishedAt,
          content,
        },
        unsubscribeToken: createSubscriberLink(
          "unsubscribe",
          subscriber,
          links,
          capturedAt.getTime(),
        ),
        preferencesToken: createSubscriberLink(
          "preferences",
          subscriber,
          links,
          capturedAt.getTime(),
        ),
      },
      settings,
    );
    entries.push({
      id,
      subscriberId: subscriber.id,
      subscriptionVersion: subscriber.subscriptionVersion,
      language: subscriber.language,
      message,
    });
  }
  await commitUnderPipelineLease(lease, (tx) =>
    saveDeliverySnapshot(tx, issueId, capturedAt, entries),
  );
}
