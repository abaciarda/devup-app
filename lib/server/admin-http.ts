import { NextResponse } from "next/server";
import "server-only";
import { adminEnv } from "./admin-env";
import { isSameOrigin } from "./security";

export function privateResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export function adminRedirect(
  path: "/admin" | "/admin/login" | "/admin/login?failed=1",
): NextResponse {
  return privateResponse(
    NextResponse.redirect(new URL(path, adminEnv().SITE_URL), 303),
  );
}

export function hasAdminOrigin(request: Request): boolean {
  return isSameOrigin(request.headers, adminEnv().SITE_URL);
}

export async function readLoginPassword(
  request: Request,
): Promise<string | null> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/x-www-form-urlencoded"
  )
    return null;
  if (Number(request.headers.get("content-length")) > 4096 || !request.body)
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
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (timedOut) return null;
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    if (
      [...form.keys()].some((key) => key !== "password") ||
      form.getAll("password").length !== 1
    )
      return null;
    const password = form.get("password");
    return password && password.length <= 256 ? password : null;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
