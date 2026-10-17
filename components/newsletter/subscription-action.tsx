"use client";

import Link from "next/link";
import { useLanguage, useLocalizedHref } from "@/components/i18n/language";
import { useState } from "react";

const copy = {
  en: {
    confirm: "Confirm subscription",
    unsubscribe: "Unsubscribe",
    preferences: "Email language",
    invalid: "This link is invalid, expired, or already used.",
    explain: "Opening this page changes nothing. Use the button to continue.",
    save: "Save email language",
    home: "Back to the newsletter",
    confirmed: "Your subscription is confirmed.",
    stopped: "You have been unsubscribed.",
    saved: "Your email language was saved.",
    again: "Subscribe again",
    privacy: "Privacy notice",
    busy: "Processing…",
  },
  tr: {
    confirm: "Aboneliği onayla",
    unsubscribe: "Abonelikten çık",
    preferences: "E-posta dili",
    invalid: "Bu bağlantı geçersiz, süresi dolmuş veya daha önce kullanılmış.",
    explain:
      "Bu sayfayı açmak bir değişiklik yapmaz. Devam etmek için düğmeye basın.",
    save: "E-posta dilini kaydet",
    home: "Bültene dön",
    confirmed: "Aboneliğiniz onaylandı.",
    stopped: "Abonelikten çıktınız.",
    saved: "E-posta diliniz kaydedildi.",
    again: "Tekrar abone ol",
    privacy: "Gizlilik bildirimi",
    busy: "İşleniyor…",
  },
};
export default function SubscriptionActionView({
  action,
  token,
  proof,
  valid,
  language = "en",
  result,
}: {
  action?: "confirm" | "unsubscribe" | "preferences";
  token?: string;
  proof?: string;
  valid: boolean;
  language?: "en" | "tr";
  result?: string;
}) {
  const uiLanguage = useLanguage();
  const text = copy[uiLanguage];
  const href = useLocalizedHref();
  const [busy, setBusy] = useState(false);
  const heading = result
    ? ((
        {
          confirm: text.confirmed,
          unsubscribe: text.stopped,
          preferences: text.saved,
        } as Record<string, string>
      )[result] ?? text.invalid)
    : valid && action
      ? text[action]
      : text.invalid;
  return (
    <main id="main" className="mx-auto max-w-xl space-y-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">{heading}</h1>
      {valid && action && !result && (
        <>
          <p className="text-muted">{text.explain}</p>
          <form
            action={`/api/${action}${uiLanguage === "en" ? "?ui=en" : ""}`}
            method="post"
            onSubmit={() => setBusy(true)}
            className="space-y-5"
          >
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="proof" value={proof} />
            {action === "preferences" && (
              <label className="block">
                {text.preferences}
                <select
                  name="language"
                  defaultValue={language}
                  className="ml-4 rounded-lg border border-line p-3"
                >
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </label>
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-blue px-6 py-3 text-white disabled:opacity-60"
            >
              {busy
                ? text.busy
                : action === "preferences"
                  ? text.save
                  : text[action]}
            </button>
          </form>
        </>
      )}
      <p>
        <Link href={href("/")} className="text-blue">
          {text.home}
        </Link>
      </p>
      {result === "unsubscribe" && (
        <Link href={href("/#subscribe")} className="block text-blue">
          {text.again}
        </Link>
      )}
      <Link href={href("/privacy")} className="block text-sm text-muted">
        {text.privacy}
      </Link>
    </main>
  );
}
