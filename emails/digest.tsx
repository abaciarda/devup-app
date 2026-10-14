import * as React from "react";
import { Heading, Hr, Link, Section, Text } from "react-email";
import type { LocalizedIssueContent } from "../types/issue-content";
import type { EmailLanguage } from "../lib/email/settings";
import EmailLayout from "./layout";

const copy = {
  en: {
    web: "Read on the website",
    source: "Original source",
    contents: "In this edition",
    main: "Main stories",
    briefs: "Brief updates",
    discussion: "discussion",
    preferences: "Email language",
    unsubscribe: "Unsubscribe",
    reason:
      "You receive this email because you confirmed your devup subscription.",
  },
  tr: {
    web: "Web sitesinde oku",
    source: "Orijinal kaynak",
    contents: "Bu sayıda",
    main: "Ana haberler",
    briefs: "Kısa haberler",
    discussion: "yorumları",
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
  featuredRawItemIds,
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
  featuredRawItemIds: number[];
  issueNumber: number;
  dateLabel: string;
  webUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
  replyTo: string;
  postalAddress: string;
}) {
  const labels = copy[language];
  const featured = new Set(featuredRawItemIds);
  const groups = [
    {
      heading: labels.main,
      stories: edition.news.filter((story) => featured.has(story.rawItemId)),
      brief: false,
    },
    {
      heading: labels.briefs,
      stories: edition.news.filter((story) => !featured.has(story.rawItemId)),
      brief: true,
    },
  ];
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
      <Section>
        <Heading as="h2" style={{ fontSize: "18px", marginTop: "24px" }}>
          {labels.contents}
        </Heading>
        {edition.news.map((story) => (
          <Text
            key={story.rawItemId}
            style={{ fontSize: "14px", margin: "6px 0" }}
          >
            {story.title}
          </Text>
        ))}
      </Section>
      {groups.map((group) => (
        <Section key={group.heading}>
          <Heading as="h2" style={{ fontSize: "22px", marginTop: "28px" }}>
            {group.heading}
          </Heading>
          {group.stories.map((story) => (
            <Section key={story.rawItemId}>
              <Hr style={{ borderColor: "#e5e5e7", marginTop: "24px" }} />
              <Text style={{ color: "#59595e", fontSize: "12px" }}>
                {new URL(story.url).hostname.replace(/^www\./, "")}
              </Text>
              <Heading
                as="h3"
                style={{
                  fontSize: group.brief ? "17px" : "20px",
                  lineHeight: "28px",
                }}
              >
                {story.title}
              </Heading>
              <Text style={{ fontSize: "15px", lineHeight: "25px" }}>
                {story.summary}
              </Text>
              <Link href={story.url}>
                {new URL(story.url).hostname.replace(/^www\./, "")}
              </Link>
              {story.discussionUrl && (
                <>
                  {" · "}
                  <Link href={story.discussionUrl}>
                    {sources[story.sourceKey]} {labels.discussion}
                  </Link>
                </>
              )}
            </Section>
          ))}
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
