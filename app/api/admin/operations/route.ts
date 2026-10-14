import { z } from "zod";
import type { NextRequest } from "next/server";
import {
  authorizeAdminMutation,
  readMutationForm,
  mutationRedirect,
} from "@/lib/server/admin/mutations";
import { privateResponse } from "@/lib/server/admin/http";
import { runCleanup } from "@/lib/server/operations/cleanup";
import { runPipeline } from "@/lib/server/operations/pipeline";
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
        ? await runPipeline("prepare")
        : await runCleanup(form.data.mode === "apply_cleanup");
    if (form.data.mode !== "prepare") {
      const url = new URL("/admin/operations", adminEnv().SITE_URL);
      url.searchParams.set("state", result.state);
      if ("limited" in result && result.limited)
        url.searchParams.set("limited", "true");
      return privateResponse(NextResponse.redirect(url, 303));
    }
    return mutationRedirect(
      null,
      result.state === "busy" ? "busy" : "operations_status",
    );
  } catch {
    return mutationRedirect(null, "operation_failed");
  }
}
