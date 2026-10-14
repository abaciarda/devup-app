import { z } from "zod";
import type { NextRequest } from "next/server";
import { privateResponse } from "@/lib/server/admin-http";
import {
  authorizeAdminMutation,
  readMutationForm,
  mutationRedirect,
} from "@/lib/server/admin-mutations";
import { runDelivery } from "@/lib/server/delivery";
import { reconcileDelivery } from "@/lib/server/delivery-reconciliation";

export const maxDuration = 60;
const issueId = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(2_147_483_647));
const formSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("issue"), issueId }),
  z.strictObject({ mode: z.literal("confirmations") }),
  z.strictObject({ mode: z.literal("retry") }),
  z.strictObject({
    mode: z.literal("reconcile"),
    kind: z.enum(["issue", "confirmation"]),
    id: z.uuid(),
    providerId: z.uuid(),
  }),
]);
export async function POST(request: NextRequest) {
  try {
    const denied = authorizeAdminMutation(request);
    if (denied) return denied;
    const parsed = formSchema.safeParse(await readMutationForm(request));
    if (!parsed.success)
      return privateResponse(new Response("Invalid request", { status: 400 }));
    const input = parsed.data;
    if (input.mode === "reconcile") {
      const state = await reconcileDelivery(
        { kind: input.kind, id: input.id },
        input.providerId,
      );
      return mutationRedirect(
        null,
        state === "busy"
          ? "busy"
          : state === "provider_backoff"
            ? "delivery_provider_backoff"
            : "delivery_reconciled",
      );
    }
    const result = await runDelivery(input);
    return mutationRedirect(
      input.mode === "issue" ? input.issueId : null,
      result.state === "busy"
        ? "busy"
        : result.state === "disabled"
          ? "delivery_disabled"
          : result.state === "provider_backoff"
            ? "delivery_provider_backoff"
            : result.state === "complete"
              ? "delivery_complete"
              : result.state === "retry_scheduled"
                ? "delivery_retry_scheduled"
                : result.state === "needs_review"
                  ? "delivery_needs_review"
                  : result.state === "daily_limit"
                    ? "delivery_daily_limit"
                    : "delivery_progress",
    );
  } catch {
    return mutationRedirect(null, "delivery_failed");
  }
}
