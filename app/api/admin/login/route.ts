import { verifyAdminPassword } from "@/lib/server/admin/credentials";
import { adminEnv } from "@/lib/server/admin/env";
import {
  adminRedirect,
  hasAdminOrigin,
  privateResponse,
  readLoginPassword,
} from "@/lib/server/admin/http";
import {
  adminCookieName,
  adminCookieOptions,
  createAdminSession,
} from "@/lib/server/admin/session";
import { consumeRateLimit } from "@/lib/server/shared/rate-limit";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    if (!hasAdminOrigin(request))
      return privateResponse(new Response("Forbidden", { status: 403 }));
    const limit = await consumeRateLimit({
      key: "admin:login",
      limit: 5,
      windowSeconds: 900,
    });
    if (!limit.allowed)
      return privateResponse(
        new Response("Too many login attempts. Try again later.", {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }),
      );
    const password = await readLoginPassword(request);
    const env = adminEnv();
    if (
      !password ||
      !(await verifyAdminPassword(password, env.ADMIN_PASSWORD_HASH))
    )
      return adminRedirect("/admin/login?failed=1");
    const response: NextResponse = adminRedirect("/admin");
    response.cookies.set(
      adminCookieName(),
      createAdminSession(env),
      adminCookieOptions(),
    );
    return response;
  } catch {
    return privateResponse(
      new Response("Admin login is temporarily unavailable.", { status: 503 }),
    );
  }
}
