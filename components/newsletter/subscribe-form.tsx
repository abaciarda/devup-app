"use client";

import { useState, type FormEvent } from "react";
import {
  useLanguage,
  useNewsletterLanguage,
  useSetNewsletterLanguage,
} from "@/components/i18n/language";
import { messages } from "@/components/i18n/messages";

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const language = useLanguage();
  const newsletterLanguage = useNewsletterLanguage();
  const setNewsletterLanguage = useSetNewsletterLanguage();
  const copy = messages[language];

  function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setHasError(true);
      return;
    }
    setHasError(false);
    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <div
        role="status"
        className="mx-auto mt-6 max-w-[490px] rounded-[18px] border border-line bg-white p-5 text-left"
      >
        <p className="font-semibold text-ink">{copy.signupComplete}</p>
        <p className="mt-2 break-all text-sm text-muted">{email.trim()}</p>
      </div>
    );
  }

  return (
    <form onSubmit={subscribe} className="mx-auto mt-6 max-w-[490px] text-left">
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
          aria-describedby={hasError ? "email-error" : "signup-note"}
          className="signup-input min-w-0 flex-1 rounded-full border-0 bg-transparent px-5 py-3.5 text-[16px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue px-6 py-3.5 text-sm text-white"
        >
          {copy.subscribeButton}
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
        <span id="signup-note">{copy.signupNote}</span>
      </div>
      <p className="mt-3 text-center text-xs text-[#59595e]">{copy.sendTime}</p>
    </form>
  );
}
