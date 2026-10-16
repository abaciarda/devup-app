import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { renderConfirmationEmail } from "@/lib/email/render";
import { emailEnv } from "@/lib/server/delivery/sender-env";
import { runDelivery } from "@/lib/server/delivery/send";
import { getDb } from "@/lib/server/database/client";
import { randomToken } from "@/lib/server/shared/security";
import { subscriptionEnv } from "@/lib/server/subscriptions/env";
import {
  limitSignup,
  readSubscriptionForm,
  subscriptionResponse,
} from "@/lib/server/subscriptions/http";
import {
  signupSchema,
  subscribeInTransaction,
} from "@/lib/server/subscriptions/storage";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const env = subscriptionEnv();
    if (request.headers.get("origin") !== new URL(env.SITE_URL).origin)
      return subscriptionResponse(new Response("Forbidden", { status: 403 }));
    if (env.SUBSCRIPTIONS_ENABLED !== "true")
      return subscriptionResponse(
        NextResponse.json({ error: "unavailable" }, { status: 503 }),
      );
    const parsed = signupSchema.safeParse(await readSubscriptionForm(request));
    if (!parsed.success)
      return subscriptionResponse(
        NextResponse.json({ error: "invalid" }, { status: 400 }),
      );
    const input = parsed.data;
    if (!input.website) {
      const retryAfter = await limitSignup(request, input.email, env);
      if (retryAfter)
        return subscriptionResponse(
          NextResponse.json(
            { error: "limited" },
            { status: 429, headers: { "Retry-After": String(retryAfter) } },
          ),
        );
      const sendId = randomUUID();
      const token = randomToken();
      const message = await renderConfirmationEmail(
        { sendId, token, email: input.email, language: input.language },
        emailEnv(),
      );
      const queued = await getDb().$transaction(
        (tx) =>
          subscribeInTransaction(tx, input, { sendId, token, message }, env),
        { maxWait: 5000, timeout: 10000 },
      );
      if (queued)
        after(async () => {
          try {
            for (let attempt = 0; attempt < 10; attempt++) {
              const result = await runDelivery({
                mode: "confirmations",
                sendId,
              });
              if (result.state !== "busy") return;
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          } catch {
            console.error(
              "Immediate confirmation attempt failed; queued for retry",
            );
          }
        });
    }
    return subscriptionResponse(
      NextResponse.json({ status: "received" }, { status: 202 }),
    );
  } catch {
    return subscriptionResponse(
      NextResponse.json({ error: "unavailable" }, { status: 503 }),
    );
  }
}
