import { authorizeScheduledRequest } from "@/lib/server/operations/http";
import { dailyHealth } from "@/lib/server/operations/health";
import { subscriptionResponse } from "@/lib/server/subscriptions/http";

export const maxDuration = 30;

export async function POST(request: Request) {
  const denied = authorizeScheduledRequest(request);
  if (denied) return denied;
  try {
    return subscriptionResponse(Response.json(await dailyHealth()));
  } catch {
    return subscriptionResponse(
      Response.json({ state: "health_unavailable" }, { status: 503 }),
    );
  }
}
