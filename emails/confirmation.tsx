import * as React from "react";
import { Button, Heading, Text } from "react-email";
import type { EmailLanguage } from "../lib/email/settings";
import EmailLayout, { emailColors } from "./layout";

export const confirmationCopy = {
  en: {
    subject: "Confirm your devup subscription",
    heading: "Confirm your email address",
    body: "You requested the English devup newsletter. Confirm to receive concise technology, software, and AI news each morning.",
    button: "Confirm subscription",
    note: "This link is valid until the original 24-hour confirmation deadline. If you did not request this email, ignore it. You will not be subscribed unless you confirm.",
  },
  tr: {
    subject: "devup aboneliğinizi onaylayın",
    heading: "E-posta adresinizi onaylayın",
    body: "Türkçe devup bültenine kayıt olmak istediniz. Her sabah teknoloji, yazılım ve yapay zekâ haberlerinin kısa özetini almak için onaylayın.",
    button: "Aboneliği onayla",
    note: "Bu bağlantı, ilk isteğinizden itibaren 24 saat geçerlidir. Bu e-postayı siz istemediyseniz yok sayın. Onay vermeden abone olmazsınız.",
  },
} as const;

export default function ConfirmationEmail({
  language,
  confirmationUrl,
  replyTo,
}: {
  language: EmailLanguage;
  confirmationUrl: string;
  replyTo: string;
}) {
  const copy = confirmationCopy[language];
  return (
    <EmailLayout
      language={language}
      preview={copy.subject}
      replyTo={replyTo}
    >
      <Heading
        as="h1"
        className="email-title"
        style={{
          color: emailColors.ink,
          fontSize: "32px",
          fontWeight: 600,
          lineHeight: "40px",
          letterSpacing: "-0.8px",
          margin: "36px 0 18px",
        }}
      >
        {copy.heading}
      </Heading>
      <Text
        style={{
          color: emailColors.ink,
          fontSize: "17px",
          lineHeight: "26px",
          letterSpacing: "-0.374px",
          margin: "0 0 24px",
        }}
      >
        {copy.body}
      </Text>
      <Button
        href={confirmationUrl}
        style={{
          backgroundColor: emailColors.primary,
          color: "#ffffff",
          padding: "15px 24px",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
        }}
      >
        {copy.button}
      </Button>
      <Text
        style={{
          fontSize: "12px",
          lineHeight: "21px",
          color: emailColors.muted,
          margin: "24px 0 0",
        }}
      >
        {copy.note}
      </Text>
    </EmailLayout>
  );
}
