import "server-only";
import { parseEmailSettings, type EmailSettings } from "../email/settings";

let cached: EmailSettings | undefined;

export function emailEnv(): EmailSettings {
  if (cached) return cached;
  try {
    cached = parseEmailSettings(
      {
        SITE_URL: process.env.SITE_URL,
        EMAIL_FROM: process.env.EMAIL_FROM,
        EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
        POSTAL_ADDRESS: process.env.POSTAL_ADDRESS,
      },
      process.env.NODE_ENV === "production",
    );
    return cached;
  } catch {
    throw new Error("Invalid email sender/contact settings");
  }
}
