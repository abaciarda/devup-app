import { z } from "zod";
import { authorizeScheduledRequest } from "@/lib/server/operations/http";
import {
  readSubscriptionForm,
  subscriptionResponse,
} from "@/lib/server/subscriptions/http";
import { runPipeline } from "@/lib/server/operations/pipeline";

export const maxDuration = 300;
export async function POST(request: Request) {
  const denied = authorizeScheduledRequest(request);
  if (denied) return denied;
  const form = z
    .strictObject({ mode: z.enum(["prepare", "delivery", "confirmations"]) })
    .safeParse(await readSubscriptionForm(request));
  if (!form.success)
    return subscriptionResponse(
      new Response("Invalid request", { status: 400 }),
    );
  try {
    return subscriptionResponse(
      Response.json(await runPipeline(form.data.mode)),
    );
  } catch {
    return subscriptionResponse(
      Response.json({ state: "operation_failed" }, { status: 503 }),
    );
  }
}
