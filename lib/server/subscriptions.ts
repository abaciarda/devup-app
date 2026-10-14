import "server-only";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { emailAddressSchema, emailLanguageSchema } from "../email/settings";
import { frozenEmailSchema, type FrozenEmail } from "../email/contracts";
import { hashToken } from "./security";
import type { SubscriptionEnv } from "./subscription-env";
import type { SubscriberLink } from "./subscriber-links";

export const signupSchema = z.strictObject({
  email: emailAddressSchema,
  language: emailLanguageSchema,
  consent: z.literal("yes"),
  website: z.string().max(200).default(""),
});
export type Signup = z.infer<typeof signupSchema>;
export type ConfirmationWork = {
  sendId: string;
  token: string;
  message: FrozenEmail;
};

export async function subscribeInTransaction(
  tx: Prisma.TransactionClient,
  value: Signup,
  work: ConfirmationWork,
  env: SubscriptionEnv,
  now = new Date(),
): Promise<void> {
  const input = signupSchema.parse(value);
  if (input.website) return;
  z.uuid().parse(work.sendId);
  if (!/^[A-Za-z0-9_-]{43}$/.test(work.token))
    throw new Error("Invalid confirmation token");
  const message = frozenEmailSchema.parse(work.message);
  if (
    message.idempotencyKey !== `confirmation/${work.sendId}` ||
    message.payload.to[0] !== input.email ||
    message.payload.tags[0].value !== work.sendId ||
    message.payload.tags[1].value !== "confirmation"
  )
    throw new Error("Confirmation work mismatch");
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${input.email}, 0))`;
  const current = await tx.subscriber.findUnique({
    where: { email: input.email },
  });
  if (current?.status === "confirmed" || current?.status === "suppressed")
    return;
  if (
    current?.status === "pending" &&
    current.confirmationExpiresAt &&
    current.confirmationExpiresAt > now
  )
    return;
  if (
    current &&
    (current.confirmationNeedsReview ||
      current.confirmationStatus === "unknown" ||
      (current.confirmationStatus === "pending" &&
        current.confirmationAttempts > 0))
  )
    return;
  const data = {
    language: input.language,
    status: "pending" as const,
    consentAt: now,
    consentVersion: env.CONSENT_VERSION,
    confirmedAt: null,
    confirmationTokenHash: hashToken(work.token),
    confirmationIssuedAt: now,
    confirmationExpiresAt: new Date(now.getTime() + 86400_000),
    confirmationSendId: work.sendId,
    confirmationPayload: message.payload,
    confirmationIdempotencyKey: message.idempotencyKey,
    confirmationStatus: "pending" as const,
    confirmationAttempts: 0,
    confirmationRetryable: false,
    confirmationNeedsReview: false,
    confirmationFirstAttemptAt: null,
    confirmationLastAttemptAt: null,
    confirmationNextAttemptAt: null,
    confirmationProviderId: null,
    confirmationAcceptedAt: null,
    confirmationDeliveredAt: null,
    confirmationBouncedAt: null,
    confirmationComplainedAt: null,
    confirmationError: null,
  };
  if (!current) {
    await tx.subscriber.create({ data: { email: input.email, ...data } });
    return;
  }
  await tx.subscriber.updateMany({
    where: {
      id: current.id,
      status: current.status,
      subscriptionVersion: current.subscriptionVersion,
      updatedAt: current.updatedAt,
    },
    data: {
      ...data,
      ...(current.status === "unsubscribed"
        ? { subscriptionVersion: { increment: 1 } }
        : {}),
    },
  });
}

const clearedConfirmation = {
  confirmationTokenHash: null,
  confirmationIssuedAt: null,
  confirmationExpiresAt: null,
  confirmationPayload: Prisma.DbNull,
  confirmationNextAttemptAt: null,
  confirmationRetryable: false,
};

export async function confirmInTransaction(
  tx: Prisma.TransactionClient,
  token: string,
  now = new Date(),
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const result = await tx.subscriber.updateMany({
    where: {
      status: "pending",
      confirmationTokenHash: hashToken(token),
      confirmationExpiresAt: { gt: now },
    },
    data: { status: "confirmed", confirmedAt: now, ...clearedConfirmation },
  });
  return result.count === 1;
}
export async function unsubscribeInTransaction(
  tx: Prisma.TransactionClient,
  link: SubscriberLink,
  now = new Date(),
): Promise<void> {
  if (link.purpose !== "unsubscribe") throw new Error("Wrong link purpose");
  const changed = await tx.subscriber.updateMany({
    where: {
      id: link.id,
      subscriptionVersion: link.subscriptionVersion,
      status: { in: ["pending", "confirmed"] },
    },
    data: {
      status: "unsubscribed",
      unsubscribedAt: now,
      subscriptionVersion: { increment: 1 },
      ...clearedConfirmation,
    },
  });
  if (!changed.count) return;
  await tx.sendLog.updateMany({
    where: {
      subscriberId: link.id,
      subscriptionVersion: link.subscriptionVersion,
      providerId: null,
      status: { in: ["pending", "failed"] },
    },
    data: {
      status: "suppressed",
      retryable: false,
      nextAttemptAt: null,
      lastError: "permission_revoked",
    },
  });
  await tx.sendLog.updateMany({
    where: {
      subscriberId: link.id,
      subscriptionVersion: link.subscriptionVersion,
      status: "unknown",
    },
    data: {
      retryable: false,
      nextAttemptAt: null,
      needsReview: true,
      lastError: "permission_revoked",
    },
  });
}
export async function preferencesInTransaction(
  tx: Prisma.TransactionClient,
  link: SubscriberLink,
  language: "en" | "tr",
): Promise<boolean> {
  if (link.purpose !== "preferences") return false;
  const changed = await tx.subscriber.updateMany({
    where: {
      id: link.id,
      subscriptionVersion: link.subscriptionVersion,
      status: "confirmed",
    },
    data: { language: emailLanguageSchema.parse(language) },
  });
  return changed.count === 1;
}
