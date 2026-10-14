import "server-only";
import { z } from "zod";
import { isPreviewDeployment } from "../operations/env";

export const deliveryEnvSchema = z.object({
  EMAIL_DELIVERY_ENABLED: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: z
    .string()
    .regex(/^re_[A-Za-z0-9_-]+$/)
    .optional(),
  EMAIL_DAILY_LIMIT: z.coerce.number().int().min(1).max(10_000).default(90),
});
export type DeliveryEnv = z.infer<typeof deliveryEnvSchema>;
export function deliveryEnv(): DeliveryEnv {
  const result = deliveryEnvSchema.safeParse({
    EMAIL_DELIVERY_ENABLED: isPreviewDeployment()
      ? "false"
      : process.env.EMAIL_DELIVERY_ENABLED || "false",
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_DAILY_LIMIT: process.env.EMAIL_DAILY_LIMIT || "90",
  });
  if (
    !result.success ||
    (result.data.EMAIL_DELIVERY_ENABLED === "true" &&
      !result.data.RESEND_API_KEY)
  )
    throw new Error("Invalid email delivery settings");
  return result.data;
}
export function webhookSecret(): string {
  const result = z
    .string()
    .regex(/^whsec_[A-Za-z0-9+/=]+$/)
    .safeParse(process.env.RESEND_WEBHOOK_SECRET);
  if (!result.success) throw new Error("Webhook settings unavailable");
  return result.data;
}
