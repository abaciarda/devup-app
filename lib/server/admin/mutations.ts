import { NextResponse, type NextRequest } from "next/server";
import "server-only";
import { z } from "zod";
import { adminEnv } from "./env";
import { hasAdminOrigin, privateResponse } from "./http";
import { adminCookieName, verifyAdminSession } from "./session";
import { publicationErrorSchema } from "../issues/publication";

export const mutationNoticeSchema = z.enum([
  "source_saved",
  "source_not_found",
  "published",
  "already_published",
  "cache_refresh_pending",
  "busy",
  "delivery_disabled",
  "delivery_progress",
  "delivery_reconciled",
  "delivery_failed",
  "delivery_complete",
  "delivery_retry_scheduled",
  "delivery_needs_review",
  "delivery_daily_limit",
  "delivery_provider_backoff",
  "operations_status",
  "draft_ready",
  "draft_already_ready",
  "draft_already_published",
  "draft_insufficient_candidates",
  "draft_generation_failed",
  "draft_preview_disabled",
  ...publicationErrorSchema.options,
  "operation_failed",
]);
export type MutationNotice = z.infer<typeof mutationNoticeSchema>;

const notices: Record<MutationNotice, string> = {
  draft_ready:
    "Today's private draft is ready. Review both languages and original sources before publishing. No email was sent.",
  draft_already_ready:
    "Today's draft is already ready. Opened it for review without replacing its content.",
  draft_already_published:
    "Today's edition is already published or locked for delivery. Its content was preserved.",
  draft_insufficient_candidates:
    "There are not enough eligible news stories to prepare a draft. Check enabled sources and ready candidate counts, then try again later.",
  draft_generation_failed:
    "Draft generation failed. Check the error shown on this edition and your Gemini settings before retrying. Nothing was published or sent.",
  draft_preview_disabled:
    "Draft preparation is disabled on preview deployments. Use your local or production workspace.",
  operations_status:
    "Operational request finished or was skipped. Check the launch settings and edition state; scheduled preparation never publishes automatically.",
  delivery_provider_backoff:
    "Resend requested a pause. All confirmation and issue submissions are paused until the shared provider cooldown expires.",
  delivery_complete:
    "Delivery processing is complete. Review accepted sends, permanent failures and provider delivery events separately.",
  delivery_retry_scheduled:
    "Eligible retries are scheduled in PostgreSQL. Run again after their next-attempt time; recurring invocations arrive in Task 12.",
  delivery_needs_review:
    "Uncertain or invalid delivery work needs operator review. Check its provider outcome before any further action.",
  delivery_daily_limit:
    "The configured daily email-attempt budget was reached. Processing can resume on the next UTC day; check your provider allowance too.",
  delivery_disabled:
    "Email sending is disabled. Configure the provider and sender settings before enabling it.",
  delivery_progress:
    "Delivery run finished. Check delivery counts and scheduled retries in the workspace; run again to continue remaining eligible work.",
  delivery_reconciled:
    "The provider email matched saved work. Its verified outcome was recorded.",
  delivery_failed:
    "Delivery operation failed. Review configuration, snapshot capacity and unresolved work before retrying.",
  source_saved: "Source setting saved.",
  source_not_found: "Source is missing. Check the source seed.",
  published:
    "Published and frozen. The edition is now available on the public website.",
  already_published:
    "This issue was already published. Its snapshot and publication time were preserved.",
  cache_refresh_pending:
    "Publication is saved, but public cache refresh failed. Use Refresh public cache below.",
  busy: "Another pipeline operation is running. Try again after it finishes.",
  issue_not_found: "The issue no longer exists.",
  issue_not_ready: "Generate and validate a ready draft before publishing.",
  issue_locked: "Delivery state prevents changing this issue.",
  review_changed:
    "The draft changed since this preview. Review the reloaded Turkish and English editions again.",
  invalid_content: "Stored content failed validation. Do not publish it.",
  invalid_assignments:
    "Selected stories no longer match the saved source assignments. Regenerate and review.",
  source_disabled:
    "A selected source is disabled. Enable it again or regenerate without it, then review.",
  invalid_evidence:
    "Saved source evidence failed validation. Regenerate and review the draft.",
  future_edition: "Future editions cannot publish yet.",
  operation_failed:
    "The operation failed. Check database access and retry after review.",
};

export function mutationNoticeText(value: unknown): string | null {
  const notice = mutationNoticeSchema.safeParse(value);
  return notice.success ? notices[notice.data] : null;
}

export function authorizeAdminMutation(request: NextRequest): Response | null {
  if (!hasAdminOrigin(request))
    return privateResponse(new Response("Forbidden", { status: 403 }));
  if (!verifyAdminSession(request.cookies.get(adminCookieName())?.value))
    return privateResponse(new Response("Unauthorized", { status: 401 }));
  return null;
}

export function mutationRedirect(
  issueId: number | null,
  notice: MutationNotice,
): NextResponse {
  const path =
    issueId === null
      ? "/admin"
      : `/admin/issues/${z.number().int().positive().max(2_147_483_647).parse(issueId)}`;
  const url = new URL(path, adminEnv().SITE_URL);
  url.searchParams.set("notice", mutationNoticeSchema.parse(notice));
  return privateResponse(NextResponse.redirect(url, 303));
}

export async function readMutationForm(
  request: Request,
): Promise<Record<string, string> | null> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/x-www-form-urlencoded"
  )
    return null;
  if (Number(request.headers.get("content-length")) > 8192 || !request.body)
    return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (timedOut) return null;
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    if ([...new Set(form.keys())].some((key) => form.getAll(key).length !== 1))
      return null;
    return Object.fromEntries(form);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
