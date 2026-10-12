import "server-only";
import { z } from "zod";

const modelName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

export const generationEnvSchema = z.strictObject({
  GEMINI_API_KEY: z.string().trim().min(16).max(256),
  GEMINI_MODEL: modelName.default("gemini-3.8-flash"),
  GEMINI_FALLBACK_MODEL: modelName.default("gemini-3.5-flash-lite"),
});

export type GenerationEnv = z.infer<typeof generationEnvSchema>;

let cached: GenerationEnv | undefined;

export function generationEnv(): GenerationEnv {
  if (cached) return cached;

  const parsed = generationEnvSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL,
  });

  if (!parsed.success) throw new Error("Invalid Gemini environment settings");
  cached = parsed.data;

  return cached;
}
