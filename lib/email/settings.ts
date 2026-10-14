import { z } from "zod";
import type { Language } from "../../types/digest";

export const emailLanguageSchema = z.enum(["en", "tr"]);
export type EmailLanguage = Language;

export const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

const singleLine = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));

export const senderSchema = singleLine.max(320).refine((value) => {
  if (z.email().safeParse(value).success) return true;
  const match = value.match(/^([^<>]+) <([^<>]+)>$/);
  return Boolean(match && z.email().safeParse(match[2]).success);
});

export const emailSettingsSchema = z.strictObject({
  SITE_URL: z
    .url()
    .max(2048)
    .refine((value) => {
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
  EMAIL_FROM: senderSchema,
  EMAIL_REPLY_TO: emailAddressSchema,
  POSTAL_ADDRESS: singleLine.min(10).max(500),
});

export type EmailSettings = z.infer<typeof emailSettingsSchema>;

export function parseEmailSettings(
  value: unknown,
  production = false,
): EmailSettings {
  const settings = emailSettingsSchema.parse(value);
  const url = new URL(settings.SITE_URL);
  if (
    production &&
    (url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  ) {
    throw new Error("Production email links require a public HTTPS site URL");
  }
  return settings;
}

export function siteLink(settings: EmailSettings, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Email links require a local absolute path");
  const url = new URL(path, settings.SITE_URL);
  if (url.origin !== new URL(settings.SITE_URL).origin)
    throw new Error("Email link origin mismatch");
  return url.href;
}

export function capabilityLink(
  settings: EmailSettings,
  path: "/confirm" | "/unsubscribe" | "/preferences" | "/api/unsubscribe",
  token: string,
): string {
  if (!/^[A-Za-z0-9_.-]{20,1024}$/.test(token))
    throw new Error("Invalid email link token format");
  const url = new URL(siteLink(settings, path));
  url.searchParams.set("token", token);
  return url.href;
}
