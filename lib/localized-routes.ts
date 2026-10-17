import type { Language } from "@/types/digest";

export const siteLanguages = ["tr", "en"] as const satisfies Language[];
export const defaultLanguage: Language = "tr";

export function isLanguage(value: unknown): value is Language {
  return value === "tr" || value === "en";
}

export function localizedPath(path: string, language: Language): string {
  const start = path.search(/[?#]/);
  const pathname = start === -1 ? path : path.slice(0, start);
  const suffix = start === -1 ? "" : path.slice(start);
  const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (language === defaultLanguage) return `${clean}${suffix}`;
  return `${clean === "/" ? `/${language}` : `/${language}${clean}`}${suffix}`;
}

export function stripLanguage(pathname: string): {
  language: Language;
  path: string;
} {
  for (const language of siteLanguages) {
    if (pathname === `/${language}`) return { language, path: "/" };
    if (pathname.startsWith(`/${language}/`))
      return { language, path: pathname.slice(language.length + 1) };
  }
  return { language: defaultLanguage, path: pathname || "/" };
}

export function languageAlternates(path: string): Record<string, string> {
  return {
    tr: localizedPath(path, "tr"),
    en: localizedPath(path, "en"),
    "x-default": localizedPath(path, defaultLanguage),
  };
}

export const openGraphLocales: Record<Language, string> = {
  tr: "tr_TR",
  en: "en_US",
};

export const htmlLanguages: Record<Language, string> = {
  tr: "tr-TR",
  en: "en-US",
};
