import {
  adminRedirect,
  hasAdminOrigin,
  privateResponse,
} from "@/lib/server/admin-http";
import {
  adminCookieName,
  adminCookieOptions,
  verifyAdminSession,
} from "@/lib/server/admin-session";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    if (!hasAdminOrigin(request))
      return privateResponse(new Response("Forbidden", { status: 403 }));
    if (!verifyAdminSession(request.cookies.get(adminCookieName())?.value))
      return privateResponse(new Response("Unauthorized", { status: 401 }));
    const response = adminRedirect("/admin/login");
    response.cookies.set(adminCookieName(), "", {
      ...adminCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch {
    return privateResponse(
      new Response("Admin logout is temporarily unavailable.", { status: 503 }),
    );
  }
}
