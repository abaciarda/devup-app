import "server-only";
import { isIP } from "node:net";
import { z } from "zod";
import { consumeRateLimit } from "./rate-limit";
import {
  subscriptionRateKey,
  verifySubscriptionProof,
  type SubscriptionAction,
} from "./subscriber-links";
import type { SubscriptionEnv } from "./subscription-env";

export function subscriptionResponse<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; form-action 'self'",
  );
  return response;
}
export async function readSubscriptionForm(
  request: Request,
  multipart = false,
): Promise<Record<string, string> | null> {
  const type = request.headers.get("content-type")?.split(";")[0].trim();
  if (
    type !== "application/x-www-form-urlencoded" &&
    !(multipart && type === "multipart/form-data")
  )
    return null;
  if (!request.body || Number(request.headers.get("content-length")) > 8192)
    return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    if (timedOut) return null;
    const body = new Uint8Array(Buffer.concat(chunks));
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    if (
      [...form.keys()].some(
        (key) =>
          form.getAll(key).length !== 1 || typeof form.get(key) !== "string",
      )
    )
      return null;
    return Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
export function authorizeSubscriptionForm(
  request: Request,
  token: string,
  proof: string,
  action: SubscriptionAction,
  env: SubscriptionEnv,
): boolean {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null" && origin !== new URL(env.SITE_URL).origin)
    return false;
  return verifySubscriptionProof(proof, token, action, env);
}
export async function limitSignup(
  request: Request,
  email: string,
  env: SubscriptionEnv,
): Promise<number> {
  let key = "global";
  if (env.SUBSCRIPTION_IP_HEADER !== "none") {
    const ip = request.headers.get(env.SUBSCRIPTION_IP_HEADER)?.trim();
    if (!ip || !isIP(ip)) throw new Error("Trusted hosting IP header missing");
    key = subscriptionRateKey(`ip:${ip}`, env);
  }
  const network = await consumeRateLimit({
    key: `subscribe:network:${key}`,
    limit: key === "global" ? 50 : 10,
    windowSeconds: 900,
  });
  if (!network.allowed) return network.retryAfterSeconds;
  const address = await consumeRateLimit({
    key: `subscribe:address:${subscriptionRateKey(email, env)}`,
    limit: 3,
    windowSeconds: 3600,
  });
  return address.allowed ? 0 : address.retryAfterSeconds;
}
export const actionFormSchema = z.strictObject({
  token: z.string().min(20).max(1024),
  proof: z.string().min(20).max(1024),
  language: z.enum(["en", "tr"]).optional(),
});
