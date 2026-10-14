import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { emailAddressSchema } from "../../email/settings";
import {
  lockSubscriber,
  readDelivery,
  patchDelivery,
  suppressSubscriberInTransaction,
  finishIssueDelivery,
  type DeliveryRef,
} from "./storage";

const tagsSchema = z.union([
  z.record(z.string(), z.string()),
  z.array(z.object({ name: z.string(), value: z.string() })),
]);
export const emailEventSchema = z.object({
  type: z.enum([
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.complained",
    "email.failed",
    "email.suppressed",
  ]),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: z.uuid(),
    to: z.array(emailAddressSchema).optional(),
    tags: tagsSchema.optional(),
    bounce: z.object({ type: z.string() }).optional(),
  }),
});
export type EmailEvent = z.infer<typeof emailEventSchema>;

export async function applyEmailEvent(
  tx: Prisma.TransactionClient,
  value: EmailEvent,
): Promise<boolean> {
  const event = emailEventSchema.parse(value);
  const tags = Array.isArray(event.data.tags)
    ? Object.fromEntries(event.data.tags.map((tag) => [tag.name, tag.value]))
    : event.data.tags;
  let archived =
    tags?.kind === "confirmation" && z.uuid().safeParse(tags.send_id).success
      ? await tx.confirmationSend.findUnique({ where: { id: tags.send_id } })
      : await tx.confirmationSend.findUnique({
          where: { providerId: event.data.email_id },
        });
  if (archived) {
    await lockSubscriber(tx, archived.subscriberId);
    archived = await tx.confirmationSend.findUniqueOrThrow({
      where: { id: archived.id },
    });
    const owner = await tx.subscriber.findUniqueOrThrow({
      where: { id: archived.subscriberId },
    });
    if (
      (archived.providerId && archived.providerId !== event.data.email_id) ||
      (event.data.to &&
        (event.data.to.length !== 1 || event.data.to[0] !== owner.email))
    )
      return false;
    const at = new Date(event.created_at);
    await tx.confirmationSend.update({
      where: { id: archived.id },
      data: {
        providerId: event.data.email_id,
        acceptedAt: archived.acceptedAt ?? at,
        ...(event.type === "email.delivered"
          ? { deliveredAt: archived.deliveredAt ?? at }
          : {}),
        ...(event.type === "email.bounced"
          ? { bouncedAt: archived.bouncedAt ?? at }
          : {}),
        ...(event.type === "email.complained"
          ? { complainedAt: archived.complainedAt ?? at }
          : {}),
      },
    });
    if (owner.confirmationSendId !== archived.id) {
      if (
        (event.type === "email.bounced" &&
          event.data.bounce?.type !== "Transient") ||
        event.type === "email.complained" ||
        event.type === "email.suppressed"
      )
        await suppressSubscriberInTransaction(
          tx,
          archived.subscriberId,
          event.type === "email.complained" ? "complaint" : "hard_bounce",
          at,
        );
      return true;
    }
  }
  let ref: DeliveryRef | null = null;
  if (tags?.kind === "issue" && z.uuid().safeParse(tags.send_id).success)
    ref = { kind: "issue", id: tags.send_id };
  if (
    tags?.kind === "confirmation" &&
    z.uuid().safeParse(tags.send_id).success
  ) {
    const row = await tx.subscriber.findUnique({
      where: { confirmationSendId: tags.send_id },
      select: { id: true },
    });
    if (row) ref = { kind: "confirmation", id: row.id };
  }
  if (!ref) {
    const send = await tx.sendLog.findUnique({
      where: { providerId: event.data.email_id },
      select: { id: true },
    });
    if (send) ref = { kind: "issue", id: send.id };
    else {
      const subscriber = await tx.subscriber.findUnique({
        where: { confirmationProviderId: event.data.email_id },
        select: { id: true },
      });
      if (subscriber) ref = { kind: "confirmation", id: subscriber.id };
    }
  }
  if (!ref) return false;
  const preliminary = await readDelivery(tx, ref);
  if (!preliminary) return false;
  await lockSubscriber(tx, preliminary.subscriberId);
  if (ref.kind === "issue")
    await tx.$queryRaw`SELECT "id" FROM "SendLog" WHERE "id" = ${ref.id} FOR UPDATE`;
  const work = await readDelivery(tx, ref);
  if (
    !work ||
    !work.attempts ||
    (work.providerId && work.providerId !== event.data.email_id) ||
    (event.data.to &&
      (event.data.to.length !== 1 || event.data.to[0] !== work.email))
  )
    return false;
  const at = new Date(event.created_at);
  const hardBounce =
    event.type === "email.bounced" && event.data.bounce?.type !== "Transient";
  const complaint = event.type === "email.complained";
  const suppressed = event.type === "email.suppressed";
  const failure =
    event.type === "email.failed" ||
    event.type === "email.bounced" ||
    complaint ||
    suppressed;
  const previousFailure = Boolean(
    work.bouncedAt ||
    work.complainedAt ||
    (work.providerId && work.status === "failed"),
  );
  await patchDelivery(tx, work, {
    providerId: event.data.email_id,
    acceptedAt: work.acceptedAt ?? at,
    status: failure || previousFailure ? "failed" : "accepted",
    retryable: false,
    needsReview: false,
    nextAttemptAt: null,
    ...(event.type === "email.delivered"
      ? { deliveredAt: work.deliveredAt ?? at }
      : {}),
    ...(event.type === "email.bounced"
      ? { bouncedAt: work.bouncedAt ?? at }
      : {}),
    ...(complaint ? { complainedAt: work.complainedAt ?? at } : {}),
    ...(failure
      ? {
          error: hardBounce
            ? "hard_bounce"
            : complaint
              ? "complaint"
              : suppressed
                ? "provider_suppressed"
                : "provider_delivery_failed",
        }
      : {}),
  });
  if (hardBounce || complaint || suppressed)
    await suppressSubscriberInTransaction(
      tx,
      work.subscriberId,
      hardBounce
        ? "hard_bounce"
        : complaint
          ? "complaint"
          : "provider_suppressed",
      at,
    );
  if (work.issueId) await finishIssueDelivery(tx, work.issueId);
  return true;
}
