import { privateResponse } from "@/lib/server/admin/http";
import {
  adminCookieName,
  verifyAdminSession,
} from "@/lib/server/admin/session";
import { NextResponse, type NextRequest } from "next/server";
import { subscriptionResponse } from "@/lib/server/subscriptions/http";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin"))
    return subscriptionResponse(NextResponse.next());
  const publicEntry =
    pathname === "/admin/login" ||
    pathname === "/api/admin/login" ||
    pathname === "/api/admin/logout";
  try {
    if (
      !publicEntry &&
      !verifyAdminSession(request.cookies.get(adminCookieName())?.value)
    ) {
      if (pathname.startsWith("/api/"))
        return privateResponse(new Response("Unauthorized", { status: 401 }));
      return privateResponse(
        NextResponse.redirect(new URL("/admin/login", request.url)),
      );
    }
    return privateResponse(NextResponse.next());
  } catch {
    return privateResponse(
      new Response("Admin is temporarily unavailable.", { status: 503 }),
    );
  }
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/confirm",
    "/unsubscribe",
    "/preferences",
    "/subscription/:path*",
    "/api/subscribe",
    "/api/confirm",
    "/api/unsubscribe",
    "/api/preferences",
  ],
};
