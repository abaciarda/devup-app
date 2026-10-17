"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { localizedPath } from "@/lib/localized-routes";

import type { Language } from "@/types/digest";
export type { Language } from "@/types/digest";

type LanguageContextValue = {
  language: Language;
  newsletterLanguage: Language;
  setNewsletterLanguage: (language: Language) => void;
};

const emailLanguageCookie = "devup-email-language";
const emailLanguageStorageKey = "devup-email-language";
const LanguageContext = createContext<LanguageContextValue | null>(null);

const preferenceEvent = "devup-newsletter-language";

function subscribePreference(onChange: () => void): () => void {
  window.addEventListener(preferenceEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(preferenceEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function storedNewsletterLanguage(): Language | null {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${emailLanguageCookie}=`))
    ?.split("=")[1];
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(emailLanguageStorageKey);
  } catch {}
  const value = cookie ?? stored;
  return value === "tr" || value === "en" ? value : null;
}

export function LanguageProvider({
  children,
  language,
}: {
  children: ReactNode;
  language: Language;
}) {
  const preference = useSyncExternalStore(
    subscribePreference,
    storedNewsletterLanguage,
    () => null,
  );

  const setNewsletterLanguage = useCallback((nextLanguage: Language) => {
    document.cookie = `${emailLanguageCookie}=${nextLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try {
      window.localStorage.setItem(emailLanguageStorageKey, nextLanguage);
    } catch {}
    window.dispatchEvent(new Event(preferenceEvent));
  }, []);

  const value = useMemo(
    () => ({
      language,
      newsletterLanguage: preference ?? language,
      setNewsletterLanguage,
    }),
    [language, preference, setNewsletterLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

function useLanguageContext() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("Language hooks must be used within LanguageProvider");
  }
  return context;
}

export function useLanguage() {
  return useLanguageContext().language;
}

export function useLocalizedHref() {
  const language = useLanguage();
  return useCallback(
    (path: string) => localizedPath(path, language),
    [language],
  );
}

export function useNewsletterLanguage() {
  return useLanguageContext().newsletterLanguage;
}

export function useSetNewsletterLanguage() {
  return useLanguageContext().setNewsletterLanguage;
}
