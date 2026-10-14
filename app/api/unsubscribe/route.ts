import { z } from "zod";
import { handleSubscriptionAction } from "@/lib/server/subscription-actions";
import {
  readSubscriptionForm,
  subscriptionResponse,
} from "@/lib/server/subscription-http";
import { subscriptionEnv } from "@/lib/server/subscription-env";
import { verifySubscriberLink } from "@/lib/server/subscriber-links";
import { unsubscribeInTransaction } from "@/lib/server/subscriptions";
import { getDb } from "@/lib/server/db";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!url.searchParams.has("token"))
    return handleSubscriptionAction(request, "unsubscribe");
  try {
    if (url.searchParams.getAll("token").length !== 1)
      return subscriptionResponse(
        new Response("Invalid token", { status: 400 }),
      );
    const form = z
      .strictObject({ "List-Unsubscribe": z.literal("One-Click") })
      .safeParse(await readSubscriptionForm(request, true));
    const link = verifySubscriberLink(
      url.searchParams.get("token")!,
      "unsubscribe",
      subscriptionEnv(),
    );
    if (!form.success || !link)
      return subscriptionResponse(
        new Response("Invalid unsubscribe request", { status: 400 }),
      );
    await getDb().$transaction((tx) => unsubscribeInTransaction(tx, link), {
      maxWait: 5000,
      timeout: 10000,
    });
    return subscriptionResponse(new Response(null, { status: 204 }));
  } catch {
    return subscriptionResponse(
      new Response("Subscription temporarily unavailable", { status: 503 }),
    );
  }
}
