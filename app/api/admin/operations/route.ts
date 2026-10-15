import { z } from "zod";
import type { NextRequest } from "next/server";
import {
  authorizeAdminMutation,
  readMutationForm,
  mutationRedirect,
} from "@/lib/server/admin/mutations";
import { privateResponse } from "@/lib/server/admin/http";
import { runCleanup } from "@/lib/server/operations/cleanup";
import { prepareManualDraft } from "@/lib/server/operations/manual-preparation";
import type { MutationNotice } from "@/lib/server/admin/mutations";
import { NextResponse } from "next/server";
import { adminEnv } from "@/lib/server/admin/env";

export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try {
    const denied = authorizeAdminMutation(request);
    if (denied) return denied;
    const form = z
      .discriminatedUnion("mode", [
        z.strictObject({ mode: z.literal("prepare") }),
        z.strictObject({ mode: z.literal("preview_cleanup") }),
        z.strictObject({
          mode: z.literal("apply_cleanup"),
          reviewedRetention: z.literal("yes"),
        }),
      ])
      .safeParse(await readMutationForm(request));
    if (!form.success)
      return privateResponse(new Response("Invalid request", { status: 400 }));
    const result =
      form.data.mode === "prepare"
        ? await prepareManualDraft()
        : await runCleanup(form.data.mode === "apply_cleanup");
    if (form.data.mode !== "prepare") {
      const url = new URL("/admin/operations", adminEnv().SITE_URL);
      url.searchParams.set("state", result.state);
      if ("limited" in result && result.limited)
        url.searchParams.set("limited", "true");
      return privateResponse(NextResponse.redirect(url, 303));
    }
    const notices: Record<string, MutationNotice> = {
      ready: "draft_ready",
      already_ready: "draft_already_ready",
      published: "draft_already_published",
      insufficient_candidates: "draft_insufficient_candidates",
      generation_failed: "draft_generation_failed",
      disabled: "draft_preview_disabled",
      busy: "busy",
    };
    return mutationRedirect(
      "issueId" in result ? (result.issueId ?? null) : null,
      notices[result.state] ?? "operation_failed",
    );
  } catch {
    return mutationRedirect(null, "operation_failed");
  }
}
