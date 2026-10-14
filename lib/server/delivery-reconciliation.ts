import "server-only";
import { z } from "zod";
import { getDb } from "./db";
import { deliveryEnv } from "./delivery-env";
import { retrieveResendEmail } from "./resend-provider";
import {
  acquirePipelineLease,
  commitUnderPipelineLease,
  releasePipelineLease,
} from "./pipeline-lease";
import { readDelivery, type DeliveryRef } from "./delivery-storage";
import { applyEmailEvent } from "./delivery-webhooks";
import { frozenEmailSchema } from "../email/contracts";
import { consumeRateLimit } from "./rate-limit";
import { providerCooldown } from "./delivery-cooldown";

export async function reconcileDelivery(ref: DeliveryRef, providerId: string) {
  z.uuid().parse(ref.id);
  z.uuid().parse(providerId);
  const env = deliveryEnv();
  if (!env.RESEND_API_KEY) throw new Error("Provider credentials unavailable");
  const lease = await acquirePipelineLease(600);
  if (!lease) return "busy" as const;
  try {
    if (await providerCooldown()) return "provider_backoff" as const;
    const work = await getDb().$transaction((tx) => readDelivery(tx, ref));
    if (!work || !work.attempts)
      throw new Error("No attempted work to reconcile");
    const message = frozenEmailSchema.safeParse(work.message);
    if (!message.success && work.kind === "issue")
      throw new Error("Invalid frozen issue work");
    const limit = await consumeRateLimit({
      key: "email:provider-second",
      limit: 1,
      windowSeconds: 1,
    });
    if (!limit.allowed)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    const email = await retrieveResendEmail(providerId, env.RESEND_API_KEY);
    const tags = Object.fromEntries(
      email.tags.map((tag) => [tag.name, tag.value]),
    );
    if (
      email.id !== providerId ||
      tags.send_id !== work.sendId ||
      tags.kind !== work.kind ||
      email.to[0].toLowerCase() !== work.email ||
      (message.success &&
        (email.from !== message.data.payload.from ||
          email.subject !== message.data.payload.subject))
    )
      throw new Error("Provider email does not match saved work");
    const type =
      email.last_event === "delivered"
        ? "email.delivered"
        : email.last_event === "bounced"
          ? "email.bounced"
          : email.last_event === "complained"
            ? "email.complained"
            : email.last_event === "failed"
              ? "email.failed"
              : email.last_event === "suppressed"
                ? "email.suppressed"
                : "email.sent";
    const changed = await commitUnderPipelineLease(lease, (tx) =>
      applyEmailEvent(tx, {
        type,
        created_at: new Date().toISOString(),
        data: { email_id: providerId, to: [work.email], tags },
      }),
    );
    if (!changed)
      throw new Error("Provider reconciliation did not match current work");
    return "reconciled" as const;
  } finally {
    await releasePipelineLease(lease);
  }
}
