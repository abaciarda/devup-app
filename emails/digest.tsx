import * as React from "react";
import { Heading, Hr, Link, Section, Text } from "react-email";
import type { LocalizedIssueContent } from "../types/issue-content";
import type { EmailLanguage } from "../lib/email/settings";
import EmailLayout from "./layout";

const copy = {
  en: {
    web: "Read on the website",
    source: "Original source",
    preferences: "Email language",
    unsubscribe: "Unsubscribe",
    reason:
      "You receive this email because you confirmed your devup subscription.",
  },
  tr: {
    web: "Web sitesinde oku",
    source: "Orijinal kaynak",
    preferences: "E-posta dili",
    unsubscribe: "Abonelikten çık",
    reason: "Bu e-postayı devup aboneliğinizi onayladığınız için alıyorsunuz.",
  },
} as const;

const sources = {
  hackernews: "Hacker News",
  devto: "Dev.to",
  lobsters: "Lobsters",
} as const;

export default function DigestEmail({
  language,
  edition,
  issueNumber,
  dateLabel,
  webUrl,
  preferencesUrl,
  unsubscribeUrl,
  replyTo,
  postalAddress,
}: {
  language: EmailLanguage;
  edition: LocalizedIssueContent;
  issueNumber: number;
  dateLabel: string;
  webUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
  replyTo: string;
  postalAddress: string;
}) {
  const labels = copy[language];
  return (
    <EmailLayout
      language={language}
      preview={edition.intro}
      replyTo={replyTo}
      postalAddress={postalAddress}
    >
      <Text style={{ color: "#59595e", fontSize: "13px" }}>
        #{issueNumber} · {dateLabel}
      </Text>
      <Heading as="h1" style={{ fontSize: "26px", lineHeight: "34px" }}>
        {edition.title}
      </Heading>
      <Text style={{ fontSize: "16px", lineHeight: "26px" }}>
        {edition.intro}
      </Text>
      <Link href={webUrl}>{labels.web}</Link>
      {edition.news.map((story) => (
        <Section key={story.rawItemId}>
          <Hr style={{ borderColor: "#e5e5e7", marginTop: "24px" }} />
          <Text style={{ color: "#59595e", fontSize: "12px" }}>
            {sources[story.sourceKey]}
          </Text>
          <Heading as="h2" style={{ fontSize: "20px", lineHeight: "28px" }}>
            {story.title}
          </Heading>
          <Text style={{ fontSize: "15px", lineHeight: "25px" }}>
            {story.summary}
          </Text>
          <Link href={story.url}>{labels.source}</Link>
        </Section>
      ))}
      <Hr style={{ borderColor: "#e5e5e7", marginTop: "28px" }} />
      <Text style={{ fontSize: "12px", lineHeight: "20px", color: "#59595e" }}>
        {labels.reason}
      </Text>
      <Text style={{ fontSize: "13px", lineHeight: "22px" }}>
        <Link href={preferencesUrl}>{labels.preferences}</Link>
        {" · "}
        <Link href={unsubscribeUrl}>{labels.unsubscribe}</Link>
      </Text>
    </EmailLayout>
  );
}
