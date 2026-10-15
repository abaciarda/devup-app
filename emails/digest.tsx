import * as React from "react";
import { Heading, Hr, Link, Section, Text } from "react-email";
import type { CSSProperties } from "react";
import {
  splitEditionStories,
  type LocalizedIssueContent,
} from "../types/issue-content";
import type { EmailLanguage } from "../lib/email/settings";
import EmailLayout, { emailColors } from "./layout";

const copy = {
  en: {
    edition: "Edition",
    web: "Read on the website",
    contents: "In this edition",
    briefCount: (count: number) =>
      `and ${count} brief ${count === 1 ? "update" : "updates"}`,
    main: "Main stories",
    briefs: "Brief updates",
    discussion: "discussion",
    preferences: "Email language",
    unsubscribe: "Unsubscribe",
    reason:
      "You receive this email because you confirmed your devup subscription.",
  },
  tr: {
    edition: "Sayı",
    web: "Web sitesinde oku",
    contents: "Bu sayıda",
    briefCount: (count: number) => `ve ${count} kısa haber`,
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
const linkStyle: CSSProperties = {
  color: emailColors.primary,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
};
const rule: CSSProperties = {
  border: "none",
  borderTop: `1px solid ${emailColors.line}`,
  margin: "26px 0",
};
const sectionHeading: CSSProperties = {
  color: emailColors.ink,
  fontSize: "21px",
  fontWeight: 600,
  lineHeight: "29px",
  margin: "0 0 14px",
};

function StorySources({
  story,
  language,
}: {
  story: LocalizedIssueContent["news"][number];
  language: EmailLanguage;
}) {
  return (
    <Text
      style={{
        color: emailColors.muted,
        fontSize: "12px",
        lineHeight: "21px",
        margin: "18px 0 0",
        overflowWrap: "anywhere",
      }}
    >
      <Link href={story.url} style={linkStyle}>
        {new URL(story.url).hostname.replace(/^www\./, "")}
      </Link>
      {story.discussionUrl && (
        <>
          {" · "}
          <Link href={story.discussionUrl} style={linkStyle}>
            {sources[story.sourceKey]} {copy[language].discussion}
          </Link>
        </>
      )}
    </Text>
  );
}

export default function DigestEmail({
  language,
  edition,
  featuredRawItemIds,
  mainStoryCount,
  issueNumber,
  draft = false,
  dateLabel,
  webUrl,
  preferencesUrl,
  unsubscribeUrl,
  replyTo,
}: {
  language: EmailLanguage;
  edition: LocalizedIssueContent;
  featuredRawItemIds: number[];
  mainStoryCount?: number;
  issueNumber: number;
  draft?: boolean;
  dateLabel: string;
  webUrl: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
  replyTo: string;
}) {
  const labels = copy[language];
  const { main, briefs } = splitEditionStories(
    edition.news,
    featuredRawItemIds,
    mainStoryCount,
  );
  return (
    <EmailLayout
      language={language}
      preview={edition.intro}
      replyTo={replyTo}
      meta={`${draft ? (language === "tr" ? "Taslak · sonraki sayı" : "Draft · next edition") : labels.edition} #${issueNumber} · ${dateLabel}`}
      footer={
        <>
          <Text
            style={{ fontSize: "12px", lineHeight: "22px", margin: "0 0 12px" }}
          >
            <Link href={webUrl} style={linkStyle}>
              {labels.web}
            </Link>
            {" · "}
            <Link href={preferencesUrl} style={linkStyle}>
              {labels.preferences}
            </Link>
            {" · "}
            <Link href={unsubscribeUrl} style={linkStyle}>
              {labels.unsubscribe}
            </Link>
          </Text>
          <Text
            style={{
              color: emailColors.muted,
              fontSize: "11px",
              lineHeight: "19px",
              margin: 0,
            }}
          >
            {labels.reason}
          </Text>
        </>
      }
    >
      <Heading
        as="h1"
        className="email-title"
        style={{
          color: emailColors.ink,
          fontSize: "32px",
          fontWeight: 600,
          lineHeight: "39px",
          letterSpacing: "-0.374px",
          margin: "32px 0 32px",
          overflowWrap: "anywhere",
        }}
      >
        {edition.title}
      </Heading>
      <Hr style={{ ...rule, margin: "0 0 28px" }} />
      <Section
        style={{
          borderLeft: `2px solid ${emailColors.line}`,
          paddingLeft: "20px",
          margin: "0 0 36px",
        }}
      >
        <Text
          style={{
            color: emailColors.ink,
            fontSize: "13px",
            fontWeight: 600,
            lineHeight: "22px",
            margin: "0 0 10px",
          }}
        >
          {labels.contents}
        </Text>
        <ul style={{ margin: 0, paddingLeft: "20px" }}>
          {main.map((story) => (
            <li
              key={story.rawItemId}
              style={{
                color: emailColors.ink,
                fontSize: "14px",
                lineHeight: "25px",
                margin: "0 0 6px",
                overflowWrap: "anywhere",
              }}
            >
              {story.title}
            </li>
          ))}
        </ul>
        {briefs.length > 0 && (
          <Text
            style={{
              color: emailColors.muted,
              fontSize: "13px",
              lineHeight: "22px",
              margin: "10px 0 0",
            }}
          >
            {labels.briefCount(briefs.length)}
          </Text>
        )}
      </Section>
      <Section>
        <Heading as="h2" style={sectionHeading}>
          {labels.main}
        </Heading>
        <Hr
          style={{
            ...rule,
            borderTopColor: emailColors.line,
            margin: "0 0 24px",
          }}
        />
        {main.map((story, index) => (
          <Section key={story.rawItemId}>
            {index > 0 && <Hr style={rule} />}
            <Heading
              as="h3"
              className="email-story-title"
              style={{
                fontSize: "22px",
                fontWeight: 600,
                lineHeight: "30px",
                letterSpacing: "-0.3px",
                color: emailColors.ink,
                margin: "0 0 12px",
                overflowWrap: "anywhere",
              }}
            >
              {story.title}
            </Heading>
            <Text
              style={{
                color: emailColors.ink,
                fontSize: "17px",
                lineHeight: "26px",
                letterSpacing: "-0.374px",
                margin: 0,
              }}
            >
              {story.summary}
            </Text>
            <StorySources story={story} language={language} />
          </Section>
        ))}
      </Section>
      {briefs.length > 0 && (
        <Section style={{ marginTop: "36px" }}>
          <Heading as="h2" style={sectionHeading}>
            {labels.briefs}
          </Heading>
          <Hr
            style={{
              ...rule,
              borderTopColor: emailColors.line,
              margin: "0 0 22px",
            }}
          />
          {briefs.map((story, index) => (
            <Section key={story.rawItemId}>
              {index > 0 && <Hr style={rule} />}
              <Text
                style={{
                  color: emailColors.ink,
                  fontSize: "17px",
                  lineHeight: "26px",
                  letterSpacing: "-0.374px",
                  margin: 0,
                  overflowWrap: "anywhere",
                }}
              >
                <strong>
                  {story.title}
                  {/[.!?…][”"’')\]]?$/u.test(story.title) ? "" : "."}
                </strong>{" "}
                {story.summary}
              </Text>
              <StorySources story={story} language={language} />
            </Section>
          ))}
        </Section>
      )}
    </EmailLayout>
  );
}
