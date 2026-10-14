import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { webhookSecret } from "@/lib/server/delivery-env";
import {
  applyEmailEvent,
  emailEventSchema,
} from "@/lib/server/delivery-webhooks";
import {
  readWebhookBody,
  verifyEmailWebhook,
} from "@/lib/server/webhook-verification";
import { subscriptionResponse } from "@/lib/server/subscription-http";

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = webhookSecret();
  } catch {
    return subscriptionResponse(new Response("Unavailable", { status: 503 }));
  }
  const raw = await readWebhookBody(request);
  if (raw === null)
    return subscriptionResponse(new Response("Invalid body", { status: 400 }));
  let verified: unknown;
  try {
    verified = verifyEmailWebhook(raw, request.headers, secret);
  } catch {
    return subscriptionResponse(
      new Response("Invalid signature", { status: 400 }),
    );
  }
  const type = z.object({ type: z.string() }).safeParse(verified);
  if (!type.success)
    return subscriptionResponse(new Response("Invalid event", { status: 400 }));
  if (
    ![
      "email.sent",
      "email.delivered",
      "email.bounced",
      "email.complained",
      "email.failed",
      "email.suppressed",
    ].includes(type.data.type)
  )
    return subscriptionResponse(new Response(null, { status: 204 }));
  const event = emailEventSchema.safeParse(verified);
  if (!event.success)
    return subscriptionResponse(new Response("Invalid event", { status: 400 }));
  try {
    await getDb().$transaction((tx) => applyEmailEvent(tx, event.data), {
      maxWait: 5000,
      timeout: 10_000,
    });
    return subscriptionResponse(new Response(null, { status: 204 }));
  } catch {
    return subscriptionResponse(new Response("Retry later", { status: 503 }));
  }
}
