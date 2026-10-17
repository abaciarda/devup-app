"use client";

import {
  useLanguage,
  useNewsletterLanguage,
  useSetNewsletterLanguage,
  useLocalizedHref,
} from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";
import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const language = useLanguage();
  const href = useLocalizedHref();
  const newsletterLanguage = useNewsletterLanguage();
  const setNewsletterLanguage = useSetNewsletterLanguage();
  const copy = messages[language];

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setHasError(true);
      return;
    }
    setHasError(false);
    if (!consent) {
      setError(copy.needConsent);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email,
          language: newsletterLanguage,
          consent: "yes",
          website: String(form.get("website") ?? ""),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        setError(
          language === "tr"
            ? response.status === 429
              ? "Çok fazla deneme. Lütfen daha sonra tekrar deneyin."
              : "Kayıt şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin."
            : response.status === 429
              ? "Too many attempts. Please try again later."
              : "Signup is currently unavailable. Please try again later.",
        );
        return;
      }
      setIsSubmitted(true);
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  if (isSubmitted) {
    return (
      <div
        role="status"
        className="mx-auto mt-6 max-w-[490px] rounded-[18px] border border-line bg-white p-5 text-left"
      >
        <p className="font-semibold text-ink">
          {language === "tr"
            ? "İsteğiniz alındı. Doğrulama gerekiyorsa bir e-posta alacaksınız. Tamamlamak için bağlantıyı izleyin."
            : "Request received. If confirmation is needed, you’ll receive an email. Follow its link to finish."}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={subscribe}
      aria-busy={busy}
      className="mx-auto mt-6 max-w-[490px] text-left"
    >
      <div className="absolute -left-[10000px]" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label htmlFor="email" className="sr-only">
        {copy.emailLabel}
      </label>
      <div className="signup-control flex flex-col gap-2 rounded-[18px] border border-line bg-white p-1.5 sm:flex-row sm:rounded-full">
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={copy.emailPlaceholder}
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setHasError(false);
          }}
          aria-invalid={hasError}
          aria-describedby={hasError ? "email-error" : undefined}
          maxLength={254}
          className="signup-input min-w-0 flex-1 rounded-full border-0 bg-transparent px-5 py-3.5 text-[16px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue px-6 py-3.5 text-sm text-white"
        >
          {busy
            ? language === "tr"
              ? "İşleniyor…"
              : "Processing…"
            : copy.subscribeButton}
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </button>
      </div>
      {hasError && (
        <p
          id="email-error"
          role="alert"
          className="mt-2 text-sm text-[#b42318]"
        >
          {copy.emailError}
        </p>
      )}
      <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed text-muted">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1"
        />
        <span>
          {copy.consentBefore}
          <Link href={href("/privacy")} className="text-blue">
            {copy.consentLink}
          </Link>
          {copy.consentAfter}
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[#b42318]">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span id="newsletter-language-label">{copy.newsletterLanguage}</span>
          <div
            role="group"
            aria-labelledby="newsletter-language-label"
            className="inline-flex rounded-full bg-[#e8e8ed] p-1"
          >
            <button
              type="button"
              aria-pressed={newsletterLanguage === "tr"}
              onClick={() => setNewsletterLanguage("tr")}
              className={
                newsletterLanguage === "tr"
                  ? "rounded-full bg-blue px-4 py-2 text-xs text-white"
                  : "rounded-full bg-transparent px-4 py-2 text-xs text-muted"
              }
            >
              Türkçe
            </button>
            <button
              type="button"
              aria-pressed={newsletterLanguage === "en"}
              onClick={() => setNewsletterLanguage("en")}
              className={
                newsletterLanguage === "en"
                  ? "rounded-full bg-blue px-4 py-2 text-xs text-white"
                  : "rounded-full bg-transparent px-4 py-2 text-xs text-muted"
              }
            >
              English
            </button>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-[#59595e]">{copy.sendTime}</p>
    </form>
  );
}
