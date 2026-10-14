import "server-only";
import { NextResponse } from "next/server";
import { getDb } from "../database/client";
import { subscriptionEnv } from "./env";
import {
  actionFormSchema,
  authorizeSubscriptionForm,
  readSubscriptionForm,
  subscriptionResponse,
} from "./http";
import {
  verifySubscriberLink,
  type SubscriptionAction,
} from "./links";
import {
  confirmInTransaction,
  preferencesInTransaction,
  unsubscribeInTransaction,
} from "./storage";

export async function handleSubscriptionAction(
  request: Request,
  action: SubscriptionAction,
): Promise<Response> {
  try {
    const env = subscriptionEnv();
    const form = actionFormSchema.safeParse(
      await readSubscriptionForm(request),
    );
    if (!form.success)
      return subscriptionResponse(
        new Response("Invalid form", { status: 400 }),
      );
    const { token, proof, language } = form.data;
    if (!authorizeSubscriptionForm(request, token, proof, action, env))
      return subscriptionResponse(new Response("Forbidden", { status: 403 }));
    const valid = await getDb().$transaction(
      async (tx) => {
        if (action === "confirm") return confirmInTransaction(tx, token);
        const link = verifySubscriberLink(token, action, env);
        if (!link) return false;
        if (action === "preferences")
          return language
            ? preferencesInTransaction(tx, link, language)
            : false;
        await unsubscribeInTransaction(tx, link);
        return true;
      },
      { maxWait: 5000, timeout: 10000 },
    );
    const result = new URL("/subscription/result", env.SITE_URL);
    result.searchParams.set("state", valid ? action : "invalid");
    return subscriptionResponse(NextResponse.redirect(result, 303));
  } catch {
    return subscriptionResponse(
      new Response("Subscription temporarily unavailable", { status: 503 }),
    );
  }
}
