import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { constantTimeEqual, hashToken } from "./security";
import { subscriptionEnv, type SubscriptionEnv } from "./subscription-env";

const linkSchema = z.strictObject({
  version: z.literal(1),
  purpose: z.enum(["unsubscribe", "preferences"]),
  id: z.uuid(),
  subscriptionVersion: z.number().int().positive().max(2_147_483_647),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive().nullable(),
});
export type SubscriberLink = z.infer<typeof linkSchema>;
export type SubscriptionAction = "confirm" | "unsubscribe" | "preferences";
const proofSchema = z.strictObject({
  version: z.literal(1),
  purpose: z.literal("form"),
  action: z.enum(["confirm", "unsubscribe", "preferences"]),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
});

function signature(value: string, secret: string): string {
  return createHmac("sha256", Buffer.from(secret, "base64url"))
    .update(value)
    .digest("base64url");
}
function signed(value: unknown, env: SubscriptionEnv): string {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded}.${signature(encoded, env.SUBSCRIBER_LINK_SECRET)}`;
}
function decoded(token: string, env: SubscriptionEnv): unknown {
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const [encoded, supplied] = token.split(".");
  const secrets = [
    env.SUBSCRIBER_LINK_SECRET,
    env.SUBSCRIBER_LINK_SECRET_PREVIOUS,
  ].filter((secret): secret is string => Boolean(secret));
  if (
    !secrets.some((secret) =>
      constantTimeEqual(supplied, signature(encoded, secret)),
    )
  )
    return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
export function createSubscriberLink(
  purpose: SubscriberLink["purpose"],
  subscriber: { id: string; subscriptionVersion: number },
  env = subscriptionEnv(),
  now = Date.now(),
): string {
  const seconds = Math.floor(now / 1000);
  return signed(
    linkSchema.parse({
      version: 1,
      purpose,
      id: subscriber.id,
      subscriptionVersion: subscriber.subscriptionVersion,
      issuedAt: seconds,
      expiresAt: purpose === "preferences" ? seconds + 30 * 86400 : null,
    }),
    env,
  );
}
export function verifySubscriberLink(
  token: string,
  purpose: SubscriberLink["purpose"],
  env = subscriptionEnv(),
  now = Date.now(),
): SubscriberLink | null {
  const result = linkSchema.safeParse(decoded(token, env));
  if (!result.success) return null;
  const link = result.data;
  const seconds = Math.floor(now / 1000);
  if (link.purpose !== purpose || link.issuedAt > seconds + 30) return null;
  if (
    purpose === "unsubscribe"
      ? link.expiresAt !== null
      : link.expiresAt === null ||
        link.expiresAt <= seconds ||
        link.expiresAt - link.issuedAt !== 30 * 86400
  )
    return null;
  return link;
}
export function createSubscriptionProof(
  token: string,
  action: SubscriptionAction,
  env = subscriptionEnv(),
  now = Date.now(),
): string {
  return signed(
    proofSchema.parse({
      version: 1,
      purpose: "form",
      action,
      tokenHash: hashToken(token),
      expiresAt: Math.floor(now / 1000) + 900,
    }),
    env,
  );
}
export function verifySubscriptionProof(
  proof: string,
  token: string,
  action: SubscriptionAction,
  env = subscriptionEnv(),
  now = Date.now(),
): boolean {
  const result = proofSchema.safeParse(decoded(proof, env));
  const seconds = Math.floor(now / 1000);
  return (
    result.success &&
    result.data.action === action &&
    result.data.expiresAt > seconds &&
    result.data.expiresAt <= seconds + 930 &&
    constantTimeEqual(result.data.tokenHash, hashToken(token))
  );
}
export function subscriptionRateKey(
  value: string,
  env: SubscriptionEnv,
): string {
  return signature(`rate:${value}`, env.SUBSCRIBER_LINK_SECRET);
}
