import { privateResponse } from "@/lib/server/admin-http";
import {
  authorizeAdminMutation,
  mutationRedirect,
  readMutationForm,
} from "@/lib/server/admin-mutations";
import { setSourceEnabled } from "@/lib/server/publication";
import { sourceKeySchema } from "@/lib/server/validation";
import type { NextRequest } from "next/server";
import { z } from "zod";

const formSchema = z.strictObject({
  sourceKey: sourceKeySchema,
  enabled: z.enum(["true", "false"]),
});

export async function POST(request: NextRequest) {
  try {
    const denied = authorizeAdminMutation(request);
    if (denied) return denied;
    const form = formSchema.safeParse(await readMutationForm(request));
    if (!form.success)
      return privateResponse(
        new Response("Invalid source form", { status: 400 }),
      );
    const result = await setSourceEnabled({
      sourceKey: form.data.sourceKey,
      enabled: form.data.enabled === "true",
    });
    return mutationRedirect(
      null,
      result.status === "saved" ? "source_saved" : result.status,
    );
  } catch {
    return privateResponse(
      new Response("Source setting is temporarily unavailable.", {
        status: 503,
      }),
    );
  }
}
