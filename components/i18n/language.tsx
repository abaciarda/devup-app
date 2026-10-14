"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import type { Language } from "@/types/digest";
export type { Language } from "@/types/digest";

type LanguageContextValue = {
  language: Language;
  newsletterLanguage: Language;
  setLanguage: (language: Language) => void;
  setNewsletterLanguage: (language: Language) => void;
};

const siteLanguageCookie = "devup-site-language";
const emailLanguageCookie = "devup-email-language";
const siteLanguageStorageKey = "devup-site-language";
const emailLanguageStorageKey = "devup-email-language";
const LanguageContext = createContext<LanguageContextValue | null>(null);

function persistLanguage(name: string, value: Language, storageKey: string) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {}
}

export function LanguageProvider({
  children,
  initialLanguage,
  initialNewsletterLanguage,
}: {
  children: ReactNode;
  initialLanguage: Language;
  initialNewsletterLanguage: Language | null;
}) {
  const router = useRouter();
  const [language, setCurrentLanguage] = useState(initialLanguage);
  const [newsletterLanguage, setCurrentNewsletterLanguage] = useState(
    initialNewsletterLanguage ?? initialLanguage,
  );
  const [hasNewsletterPreference, setHasNewsletterPreference] = useState(
    initialNewsletterLanguage !== null,
  );

  const setLanguage = useCallback(
    (nextLanguage: Language) => {
      setCurrentLanguage(nextLanguage);
      persistLanguage(siteLanguageCookie, nextLanguage, siteLanguageStorageKey);
      if (!hasNewsletterPreference) {
        setCurrentNewsletterLanguage(nextLanguage);
      }
      router.refresh();
    },
    [hasNewsletterPreference, router],
  );

  const setNewsletterLanguage = useCallback((nextLanguage: Language) => {
    setCurrentNewsletterLanguage(nextLanguage);
    setHasNewsletterPreference(true);
    persistLanguage(emailLanguageCookie, nextLanguage, emailLanguageStorageKey);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      newsletterLanguage,
      setLanguage,
      setNewsletterLanguage,
    }),
    [language, newsletterLanguage, setLanguage, setNewsletterLanguage],
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

export function useNewsletterLanguage() {
  return useLanguageContext().newsletterLanguage;
}

export function useSetLanguage() {
  return useLanguageContext().setLanguage;
}

export function useSetNewsletterLanguage() {
  return useLanguageContext().setNewsletterLanguage;
}
