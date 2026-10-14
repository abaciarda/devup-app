import * as React from "react";
import { Body, Container, Head, Hr, Html, Preview, Text } from "react-email";
import type { ReactNode } from "react";
import type { EmailLanguage } from "../lib/email/settings";

export default function EmailLayout({
  language,
  preview,
  replyTo,
  postalAddress,
  children,
}: {
  language: EmailLanguage;
  preview: string;
  replyTo: string;
  postalAddress: string;
  children: ReactNode;
}) {
  return (
    <Html lang={language}>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{ backgroundColor: "#f5f5f7", fontFamily: "Arial, sans-serif" }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            maxWidth: "600px",
            margin: "24px auto",
            padding: "28px",
            color: "#1d1d1f",
          }}
        >
          <Text style={{ fontSize: "24px", fontWeight: "bold" }}>devup</Text>
          {children}
          <Hr style={{ borderColor: "#e5e5e7", marginTop: "28px" }} />
          <Text
            style={{ color: "#59595e", fontSize: "12px", lineHeight: "20px" }}
          >
            {language === "tr" ? "İletişim" : "Contact"}: {replyTo}
            <br />
            {postalAddress}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
