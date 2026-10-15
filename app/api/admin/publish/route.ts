import { privateResponse } from "@/lib/server/admin/http";
import {
  authorizeAdminMutation,
  mutationRedirect,
  readMutationForm,
} from "@/lib/server/admin/mutations";
import {
  PublicationError,
  publishReviewedIssue,
} from "@/lib/server/issues/publication";
import { refreshPublishedIssueCache } from "@/lib/server/issues/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";

const formSchema = z.strictObject({
  issueId: z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(2_147_483_647)),
  reviewVersion: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedTr: z.literal("yes"),
  reviewedEn: z.literal("yes"),
});

export async function POST(request: NextRequest) {
  let issueId: number | null = null;
  try {
    const denied = authorizeAdminMutation(request);
    if (denied) return denied;
    const form = formSchema.safeParse(await readMutationForm(request));
    if (!form.success)
      return privateResponse(
        new Response(
          "Review both languages and submit a valid publication form",
          { status: 400 },
        ),
      );
    issueId = form.data.issueId;
    const result = await publishReviewedIssue({
      issueId,
      reviewVersion: form.data.reviewVersion,
      reviewedTr: true,
      reviewedEn: true,
    });
    if (result.status === "busy") return mutationRedirect(issueId, "busy");
    try {
      refreshPublishedIssueCache(result.editionKey);
    } catch {
      return mutationRedirect(issueId, "cache_refresh_pending");
    }
    return mutationRedirect(issueId, result.status);
  } catch (error) {
    if (error instanceof PublicationError)
      return mutationRedirect(issueId, error.code);
    return privateResponse(
      new Response(
        "Publication is temporarily unavailable. Reload the issue to inspect its saved state.",
        { status: 503 },
      ),
    );
  }
}
