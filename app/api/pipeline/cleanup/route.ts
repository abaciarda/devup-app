import { authorizeScheduledRequest } from "@/lib/server/operations-http";
import { subscriptionResponse } from "@/lib/server/subscription-http";
import { runCleanup } from "@/lib/server/cleanup";

export const maxDuration = 60;
export async function POST(request: Request) {
  const denied = authorizeScheduledRequest(request);
  if (denied) return denied;
  try {
    return subscriptionResponse(Response.json(await runCleanup(true)));
  } catch {
    return subscriptionResponse(
      Response.json({ state: "cleanup_failed" }, { status: 503 }),
    );
  }
}
