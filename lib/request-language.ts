import { cookies, headers } from "next/headers";
import type { Language } from "@/components/i18n/language";

const siteLanguageCookie = "devup-site-language";
const emailLanguageCookie = "devup-email-language";

function normalizeLanguage(value: string | undefined): Language | null {
  if (value === "tr") return "tr";
  if (value === "en") return "en";
  return null;
}

function languageFromHeader(value: string | null): Language {
  const preferences = (value ?? "")
    .split(",")
    .map((item, index) => {
      const [locale, qualityParameter] = item.trim().split(";");
      const qualityMatch = qualityParameter?.trim().match(/^q=(\d*\.?\d+)$/i);
      return {
        locale: locale.toLowerCase(),
        quality: qualityMatch ? Number(qualityMatch[1]) : 1,
        index,
      };
    })
    .filter((preference) => preference.quality > 0)
    .sort((first, second) => {
      return second.quality - first.quality || first.index - second.index;
    });

  for (const preference of preferences) {
    if (/^tr(?:-|$)/.test(preference.locale)) return "tr";
    if (/^en(?:-|$)/.test(preference.locale)) return "en";
  }

  return "en";
}

export async function getRequestLanguages() {
  const cookieStore = await cookies();
  const preferredSiteLanguage = normalizeLanguage(
    cookieStore.get(siteLanguageCookie)?.value,
  );
  const newsletterLanguage = normalizeLanguage(
    cookieStore.get(emailLanguageCookie)?.value,
  );

  const requestHeaders = await headers();

  return {
    language:
      preferredSiteLanguage ??
      languageFromHeader(requestHeaders.get("accept-language")),
    newsletterLanguage,
  };
}
