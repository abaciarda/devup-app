import { NextResponse, type NextRequest } from "next/server";
import "server-only";
import { z } from "zod";
import { adminEnv } from "./admin-env";
import { hasAdminOrigin, privateResponse } from "./admin-http";
import { adminCookieName, verifyAdminSession } from "./admin-session";
import { publicationErrorSchema } from "./publication";

export const mutationNoticeSchema = z.enum([
  "source_saved",
  "source_not_found",
  "published",
  "already_published",
  "cache_refresh_pending",
  "busy",
  ...publicationErrorSchema.options,
  "operation_failed",
]);
export type MutationNotice = z.infer<typeof mutationNoticeSchema>;

const notices: Record<MutationNotice, string> = {
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
