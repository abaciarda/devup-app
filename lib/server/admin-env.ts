import "server-only";
import { z } from "zod";

export const adminEnvSchema = z.strictObject({
  SITE_URL: z.url().refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  }),
  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(/^scrypt:32768:8:3:[a-f0-9]{32}:[a-f0-9]{64}$/),
  SESSION_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export type AdminEnv = z.infer<typeof adminEnvSchema>;

let cached: AdminEnv | undefined;

export function adminEnv(): AdminEnv {
  if (cached) return cached;
  const result = adminEnvSchema.safeParse({
    SITE_URL: process.env.SITE_URL,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
  if (!result.success) throw new Error("Invalid admin environment settings");
  if (
    process.env.NODE_ENV === "production" &&
    new URL(result.data.SITE_URL).protocol !== "https:"
  ) {
    throw new Error("Production admin requires an HTTPS site URL");
  }
  cached = result.data;
  return cached;
}
