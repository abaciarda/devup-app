import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function constantTimeEqual(value: string, expected: string): boolean {
  if (
    value.length === 0 ||
    expected.length === 0 ||
    value.length > 4096 ||
    expected.length > 4096
  ) {
    return false;
  }

  const actualHash = createHash("sha256").update(value, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();

  return timingSafeEqual(actualHash, expectedHash);
}

export function hasBearerToken(headers: Headers, expected: string): boolean {
  if (expected.length < 32) return false;

  const authorization = headers.get("authorization");
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/);

  return match !== undefined && match !== null
    ? constantTimeEqual(match[1], expected)
    : false;
}

export function isSameOrigin(headers: Headers, siteUrl: string): boolean {
  const site = new URL(siteUrl);

  if (
    !["http:", "https:"].includes(site.protocol) ||
    site.username !== "" ||
    site.password !== ""
  ) {
    throw new Error("SITE_URL must be an HTTP(S) site URL without credentials");
  }

  return headers.get("origin") === site.origin;
}
