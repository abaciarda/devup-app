import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  hashAdminPassword,
  verifyAdminPassword,
} from "../lib/server/admin/credentials";
import { adminEnvSchema } from "../lib/server/admin/env";
import {
  hasAdminOrigin,
  privateResponse,
  readLoginPassword,
} from "../lib/server/admin/http";
import {
  adminCookieName,
  adminCookieOptions,
  createAdminSession,
  sessionSeconds,
  verifyAdminSession,
} from "../lib/server/admin/session";

const password = "fixture-only-password-never-use";
const hash = await hashAdminPassword(password);
assert.notEqual(hash, await hashAdminPassword(password));
assert.equal(await verifyAdminPassword(password, hash), true);
assert.equal(
  await verifyAdminPassword("wrong-password-of-enough-length", hash),
  false,
);
assert.equal(await verifyAdminPassword(password, "invalid-hash"), false);
const env = adminEnvSchema.parse({
  SITE_URL: "http://localhost:3000",
  ADMIN_PASSWORD_HASH: hash,
  SESSION_SECRET: randomBytes(32).toString("base64url"),
});
const now = Date.parse("2099-04-01T09:00:00.000Z");
const token = createAdminSession(env, now);
assert.equal(verifyAdminSession(token, env, now), true);
assert.equal(
  verifyAdminSession(token, env, now + sessionSeconds * 1000),
  false,
);
assert.equal(verifyAdminSession(token, env, now - 60_000), false);
assert.equal(verifyAdminSession(undefined, env, now), false);
const originalClock = Date.now;
Date.now = () => {
  throw new Error("Missing sessions must not read the clock");
};
try {
  assert.equal(verifyAdminSession(undefined, env), false);
} finally {
  Date.now = originalClock;
}

const [payload, signature] = token.split(".");
const tampered = Buffer.from(
  JSON.stringify({ version: 1, expiresAt: 9_999_999_999 }),
).toString("base64url");
assert.equal(verifyAdminSession(`${tampered}.${signature}`, env, now), false);
assert.equal(verifyAdminSession(`${payload}.invalid`, env, now), false);
assert.equal(
  verifyAdminSession(
    token,
    { ...env, SESSION_SECRET: randomBytes(32).toString("base64url") },
    now,
  ),
  false,
);
assert.equal(
  verifyAdminSession(
    token,
    { ...env, ADMIN_PASSWORD_HASH: await hashAdminPassword(password) },
    now,
  ),
  false,
);
assert.equal(adminCookieName(true), "__Host-devup-admin");
assert.equal(adminCookieOptions(true).secure, true);
assert.equal(adminCookieOptions(false).secure, false);
assert.equal(adminCookieOptions().httpOnly, true);
assert.equal(adminCookieOptions().sameSite, "strict");
assert.throws(() =>
  adminEnvSchema.parse({
    ...env,
    SITE_URL: "https://example.com/unexpected-path",
  }),
);

process.env.SITE_URL = env.SITE_URL;
process.env.ADMIN_PASSWORD_HASH = env.ADMIN_PASSWORD_HASH;
process.env.SESSION_SECRET = env.SESSION_SECRET;
const form = (body: string, origin = env.SITE_URL) =>
  new Request(`${env.SITE_URL}/api/admin/login`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
assert.equal(hasAdminOrigin(form("password=anything")), true);
assert.equal(hasAdminOrigin(form("password=anything", "null")), false);
assert.equal(
  hasAdminOrigin(form("password=anything", "https://other.example")),
  false,
);
assert.equal(
  await readLoginPassword(form(new URLSearchParams({ password }).toString())),
  password,
);
assert.equal(await readLoginPassword(form("password=a&password=b")), null);
assert.equal(await readLoginPassword(form("password=a&extra=b")), null);
assert.equal(
  await readLoginPassword(form(`password=${"a".repeat(4097)}`)),
  null,
);
assert.equal(
  await readLoginPassword(
    new Request(`${env.SITE_URL}/api/admin/login`, {
      method: "POST",
      body: "password=a",
    }),
  ),
  null,
);
const response = privateResponse(new Response("private"));
assert.equal(response.headers.get("Referrer-Policy"), "same-origin");
assert.ok(response.headers.get("Cache-Control")?.includes("no-store"));
assert.ok(response.headers.get("X-Robots-Tag")?.includes("noindex"));
console.log(
  "Admin credentials, sessions, origins and bounded form checks passed",
);
