import { createHmac, randomBytes } from "node:crypto";
import "server-only";
import { z } from "zod";
import { adminEnv, type AdminEnv } from "./admin-env";
import { constantTimeEqual, hashToken } from "./security";

export const sessionSeconds = 8 * 60 * 60;

const payloadSchema = z.strictObject({
  version: z.literal(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  credentialVersion: z.string().regex(/^[a-f0-9]{64}$/),
});

function signature(payload: string, env: AdminEnv): string {
  return createHmac("sha256", Buffer.from(env.SESSION_SECRET, "base64url"))
    .update(payload)
    .digest("base64url");
}

export function adminCookieName(
  production = process.env.NODE_ENV === "production",
): string {
  return production ? "__Host-devup-admin" : "devup-admin";
}

export function adminCookieOptions(
  production = process.env.NODE_ENV === "production",
) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "strict" as const,
    path: "/",
    maxAge: sessionSeconds,
  };
}

export function createAdminSession(
  env: AdminEnv = adminEnv(),
  now = Date.now(),
): string {
  const issuedAt = Math.floor(now / 1000);

  const payload = Buffer.from(
    JSON.stringify(
      payloadSchema.parse({
        version: 1,
        issuedAt,
        expiresAt: issuedAt + sessionSeconds,
        nonce: randomBytes(16).toString("base64url"),
        credentialVersion: hashToken(env.ADMIN_PASSWORD_HASH),
      }),
    ),
  ).toString("base64url");

  return `${payload}.${signature(payload, env)}`;
}

export function verifyAdminSession(
  token: string | undefined,
  env: AdminEnv = adminEnv(),
  now?: number,
): boolean {
  if (
    !token ||
    token.length > 2048 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
  )
    return false;
  const [encoded, supplied] = token.split(".");
  if (!constantTimeEqual(supplied, signature(encoded, env))) return false;
  try {
    const payload = payloadSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    const seconds = Math.floor((now ?? Date.now()) / 1000);
    return (
      payload.issuedAt <= seconds + 30 &&
      payload.expiresAt > seconds &&
      payload.expiresAt - payload.issuedAt === sessionSeconds &&
      constantTimeEqual(
        payload.credentialVersion,
        hashToken(env.ADMIN_PASSWORD_HASH),
      )
    );
  } catch {
    return false;
  }
}
