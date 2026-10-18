import { privateResponse } from "@/lib/server/admin/http";
import {
  adminCookieName,
  verifyAdminSession,
} from "@/lib/server/admin/session";
import { NextResponse, type NextRequest } from "next/server";
import { subscriptionResponse } from "@/lib/server/subscriptions/http";
import { defaultLanguage, stripLanguage } from "@/lib/localized-routes";

const subscriptionApis = new Set([
  "/api/subscribe",
  "/api/confirm",
  "/api/unsubscribe",
  "/api/preferences",
]);

function adminResponse(request: NextRequest, pathname: string) {
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

function sameOrigin(request: NextRequest, pathname: string): URL {
  const url = new URL(request.url);
  url.pathname = pathname;
  return url;
}

function isEditionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isSubscriptionPage(path: string): boolean {
  return /^\/(?:confirm|unsubscribe|preferences|subscription)(?:\/|$)/.test(
    path,
  );
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin")
  )
    return adminResponse(request, pathname);
  if (subscriptionApis.has(pathname))
    return subscriptionResponse(NextResponse.next());
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/_vercel/") ||
    (/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith("/rss.xml"))
  )
    return NextResponse.next();

  const { language, path } = stripLanguage(pathname);
  const secure = <T extends Response>(response: T): T =>
    isSubscriptionPage(path) ? subscriptionResponse(response) : response;

  const edition = path.match(/^\/digest\/([^/]+)(?:\/opengraph-image[^/]*)?$/);
  if (edition && !isEditionDate(edition[1])) {
    return NextResponse.rewrite(sameOrigin(request, `/${language}/missing`));
  }

  if (pathname !== path || language !== defaultLanguage)
    return secure(NextResponse.next());

  return secure(
    NextResponse.rewrite(
      sameOrigin(request, `/${defaultLanguage}${path === "/" ? "" : path}`),
    ),
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
