import * as React from "react";
import {
  Body,
  Column,
  Container,
  Font,
  Head,
  Hr,
  Html,
  Preview,
  Row,
  Text,
} from "react-email";
import type { ReactNode } from "react";
import type { EmailLanguage } from "../lib/email/settings";

export const emailColors = {
  primary: "#0066cc",
  ink: "#1d1d1f",
  muted: "#7a7a7a",
  line: "#e0e0e0",
  soft: "#f5f5f7",
  white: "#ffffff",
};

const emailFont =
  "-apple-system, BlinkMacSystemFont, Geist, 'Segoe UI', Arial, sans-serif";

const geistFonts = [
  {
    weight: 400,
    url: "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RnOM4nQ.ttf",
  },
  {
    weight: 600,
    url: "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RQuQ4nQ.ttf",
  },
  {
    weight: 700,
    url: "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_Re-Q4nQ.ttf",
  },
];

export default function EmailLayout({
  language,
  preview,
  replyTo,
  meta,
  footer,
  children,
}: {
  language: EmailLanguage;
  preview: string;
  replyTo: string;
  meta?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Html lang={language}>
      <Head>
        {geistFonts.map((font) => (
          <Font
            key={font.weight}
            fontFamily="Geist"
            fallbackFontFamily={["Arial", "sans-serif"]}
            webFont={{ url: font.url, format: "truetype" }}
            fontWeight={font.weight}
            fontStyle="normal"
          />
        ))}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { font-family: ${emailFont}; }
          @media only screen and (max-width: 600px) {
            .email-shell { margin: 0 auto !important; }
            .email-content { padding: 28px 20px !important; }
            .email-title { font-size: 28px !important; line-height: 35px !important; letter-spacing: -0.374px !important; }
            .email-story-title { font-size: 20px !important; line-height: 28px !important; }
            .email-meta { font-size: 11px !important; line-height: 17px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: emailColors.soft,
          margin: 0,
          padding: 0,
          fontFamily: emailFont,
          color: emailColors.ink,
        }}
      >
        <Container
          className="email-shell"
          style={{
            backgroundColor: emailColors.white,
            maxWidth: "640px",
            width: "100%",
            margin: "32px auto",
          }}
        >
          <table
            role="presentation"
            cellPadding="0"
            cellSpacing="0"
            style={{ width: "100%" }}
          >
            <tbody>
              <tr>
                <td className="email-content" style={{ padding: "36px 40px" }}>
                  <Row>
                    <Column style={{ width: "32%", verticalAlign: "middle" }}>
                      <Text
                        style={{
                          color: emailColors.ink,
                          fontSize: "29px",
                          fontWeight: 700,
                          letterSpacing: "-1.2px",
                          lineHeight: "34px",
                          margin: 0,
                        }}
                      >
                        devup
                      </Text>
                    </Column>
                    <Column align="right" style={{ verticalAlign: "middle" }}>
                      <Text
                        className="email-meta"
                        style={{
                          color: emailColors.muted,
                          fontSize: "12px",
                          lineHeight: "19px",
                          margin: 0,
                        }}
                      >
                        {meta ??
                          (language === "tr"
                            ? "ABONELİK ONAYI"
                            : "SUBSCRIPTION CONFIRMATION")}
                      </Text>
                    </Column>
                  </Row>
                  {children}
                  <Hr
                    style={{
                      border: "none",
                      borderTop: `1px solid ${emailColors.line}`,
                      margin: "40px 0 24px",
                    }}
                  />
                  <Text
                    style={{
                      color: emailColors.ink,
                      fontSize: "22px",
                      fontWeight: 700,
                      letterSpacing: "-0.7px",
                      margin: "0 0 8px",
                    }}
                  >
                    devup
                  </Text>
                  <Text
                    style={{
                      fontSize: "13px",
                      lineHeight: "21px",
                      color: emailColors.muted,
                      margin: "0 0 16px",
                    }}
                  >
                    {language === "tr"
                      ? "Yazılımcılar için günlük teknoloji özeti."
                      : "A daily tech briefing for developers."}
                  </Text>
                  {footer}
                  <Text
                    style={{
                      color: emailColors.muted,
                      fontSize: "11px",
                      lineHeight: "19px",
                      margin: "16px 0 0",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {language === "tr" ? "İletişim" : "Contact"}: {replyTo}
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Container>
      </Body>
    </Html>
  );
}
