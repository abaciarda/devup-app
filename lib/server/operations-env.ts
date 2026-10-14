import "server-only";
import { z } from "zod";

export const operationsEnvSchema = z.object({
  PIPELINE_ENABLED: z.enum(["true", "false"]).default("false"),
  CLEANUP_ENABLED: z.enum(["true", "false"]).default("false"),
  CRON_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  PUBLIC_LAUNCH_APPROVED: z.enum(["true", "false"]).default("false"),
});
export function operationsEnv() {
  const parsed = operationsEnvSchema.safeParse({
    PIPELINE_ENABLED: process.env.PIPELINE_ENABLED || "false",
    CLEANUP_ENABLED: process.env.CLEANUP_ENABLED || "false",
    CRON_SECRET: process.env.CRON_SECRET,
    PUBLIC_LAUNCH_APPROVED: process.env.PUBLIC_LAUNCH_APPROVED || "false",
  });
  if (!parsed.success) throw new Error("Invalid operational settings");
  return parsed.data;
}
export function isPreviewDeployment() {
  return process.env.VERCEL_ENV === "preview";
}
