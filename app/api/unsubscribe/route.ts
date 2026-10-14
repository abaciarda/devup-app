import { z } from "zod";
import { handleSubscriptionAction } from "@/lib/server/subscriptions/actions";
import {
  readSubscriptionForm,
  subscriptionResponse,
} from "@/lib/server/subscriptions/http";
import { subscriptionEnv } from "@/lib/server/subscriptions/env";
import { verifySubscriberLink } from "@/lib/server/subscriptions/links";
import { unsubscribeInTransaction } from "@/lib/server/subscriptions/storage";
import { getDb } from "@/lib/server/database/client";

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
