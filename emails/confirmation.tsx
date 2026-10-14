import * as React from "react";
import { Button, Heading, Text } from "react-email";
import type { EmailLanguage } from "../lib/email/settings";
import EmailLayout from "./layout";

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
  postalAddress,
}: {
  language: EmailLanguage;
  confirmationUrl: string;
  replyTo: string;
  postalAddress: string;
}) {
  const copy = confirmationCopy[language];
  return (
    <EmailLayout
      language={language}
      preview={copy.subject}
      replyTo={replyTo}
      postalAddress={postalAddress}
    >
      <Heading as="h1" style={{ fontSize: "24px", lineHeight: "32px" }}>
        {copy.heading}
      </Heading>
      <Text style={{ fontSize: "16px", lineHeight: "26px" }}>{copy.body}</Text>
      <Button
        href={confirmationUrl}
        style={{
          backgroundColor: "#0071e3",
          color: "#ffffff",
          padding: "14px 20px",
          borderRadius: "8px",
        }}
      >
        {copy.button}
      </Button>
      <Text style={{ fontSize: "13px", lineHeight: "22px", color: "#59595e" }}>
        {copy.note}
      </Text>
    </EmailLayout>
  );
}
