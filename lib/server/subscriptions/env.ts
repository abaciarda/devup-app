import "server-only";
import { z } from "zod";
import { emailSettingsSchema } from "../../email/settings";
import { isPreviewDeployment } from "../operations/env";

export const subscriptionEnvSchema = z.strictObject({
  SITE_URL: emailSettingsSchema.shape.SITE_URL,
  SUBSCRIBER_LINK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  SUBSCRIBER_LINK_SECRET_PREVIOUS: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
  CONSENT_VERSION: z.string().trim().min(1).max(100),
  SUBSCRIPTIONS_ENABLED: z.enum(["true", "false"]).default("false"),
  SUBSCRIPTION_IP_HEADER: z
    .enum(["none", "x-vercel-forwarded-for", "cf-connecting-ip"])
    .default("none"),
});
export type SubscriptionEnv = z.infer<typeof subscriptionEnvSchema>;

export function subscriptionEnv(): SubscriptionEnv {
  const result = subscriptionEnvSchema.safeParse({
    SITE_URL: process.env.SITE_URL,
    SUBSCRIBER_LINK_SECRET: process.env.SUBSCRIBER_LINK_SECRET,
    SUBSCRIBER_LINK_SECRET_PREVIOUS:
      process.env.SUBSCRIBER_LINK_SECRET_PREVIOUS || undefined,
    CONSENT_VERSION: process.env.CONSENT_VERSION,
    SUBSCRIPTIONS_ENABLED: process.env.SUBSCRIPTIONS_ENABLED || "false",
    SUBSCRIPTION_IP_HEADER: process.env.SUBSCRIPTION_IP_HEADER || "none",
  });
  if (
    !result.success ||
    (process.env.NODE_ENV === "production" &&
      new URL(result.data.SITE_URL).protocol !== "https:")
  )
    throw new Error("Invalid subscription settings");
  if (
    isPreviewDeployment() ||
    (process.env.NODE_ENV === "production" &&
      process.env.PUBLIC_LAUNCH_APPROVED !== "true")
  )
    result.data.SUBSCRIPTIONS_ENABLED = "false";
  return result.data;
}
