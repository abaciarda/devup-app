import "server-only";
import { hasBearerToken } from "./security";
import { operationsEnv } from "./operations-env";
import { subscriptionResponse } from "./subscription-http";

export function authorizeScheduledRequest(request: Request) {
  try {
    if (!hasBearerToken(request.headers, operationsEnv().CRON_SECRET))
      return subscriptionResponse(
        new Response("Unauthorized", { status: 401 }),
      );
    return null;
  } catch {
    return subscriptionResponse(new Response("Unavailable", { status: 503 }));
  }
}
