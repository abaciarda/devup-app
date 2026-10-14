import * as React from "react";
import { render, toPlainText } from "@react-email/render";
import { z } from "zod";
import ConfirmationEmail, { confirmationCopy } from "../../emails/confirmation";
import DigestEmail from "../../emails/digest";
import { issueContentSchema } from "../../types/issue-content";
import { editionDateFromKey } from "../edition-date";
import { emailSubject, frozenEmailSchema, type FrozenEmail } from "./contracts";
import {
  capabilityLink,
  emailAddressSchema,
  emailLanguageSchema,
  parseEmailSettings,
  siteLink,
  type EmailSettings,
} from "./settings";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_.-]{20,1024}$/);
const recipientSchema = z.strictObject({
  sendId: z.uuid(),
  email: emailAddressSchema,
  language: emailLanguageSchema,
});

const confirmationInputSchema = recipientSchema.extend({ token: tokenSchema });
const digestInputSchema = recipientSchema.extend({
  issue: z.strictObject({
    id: z.number().int().positive(),
    date: z.string().refine((value) => {
      try {
        editionDateFromKey(value);
        return true;
      } catch {
        return false;
      }
    }),
    publishedAt: z.date(),
    content: issueContentSchema,
  }),
  unsubscribeToken: tokenSchema,
  preferencesToken: tokenSchema,
});

function plainText(html: string): string {
  return toPlainText(html, {
    wordwrap: false,
    selectors: [
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
    ],
  });
}

export async function renderConfirmationEmail(
  value: unknown,
  configuration: EmailSettings,
): Promise<FrozenEmail> {
  const input = confirmationInputSchema.parse(value);
  const settings = parseEmailSettings(configuration);
  const html = await render(
    <ConfirmationEmail
      language={input.language}
      confirmationUrl={capabilityLink(settings, "/confirm", input.token)}
      replyTo={settings.EMAIL_REPLY_TO}
      postalAddress={settings.POSTAL_ADDRESS}
    />,
  );
  return frozenEmailSchema.parse({
    idempotencyKey: `confirmation/${input.sendId}`,
    payload: {
      from: settings.EMAIL_FROM,
      to: [input.email],
      reply_to: settings.EMAIL_REPLY_TO,
      subject: confirmationCopy[input.language].subject,
      html,
      text: plainText(html),
      tags: [
        { name: "send_id", value: input.sendId },
        { name: "kind", value: "confirmation" },
      ],
    },
  });
}

export async function renderDigestEmail(
  value: unknown,
  configuration: EmailSettings,
): Promise<FrozenEmail> {
  const input = digestInputSchema.parse(value);
  const settings = parseEmailSettings(configuration);
  const edition = input.issue.content[input.language];
  const dateLabel = new Intl.DateTimeFormat(
    input.language === "tr" ? "tr-TR" : "en-GB",
    {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(new Date(`${input.issue.date}T00:00:00.000Z`));
  const html = await render(
    <DigestEmail
      language={input.language}
      edition={edition}
      issueNumber={input.issue.id}
      dateLabel={dateLabel}
      webUrl={siteLink(settings, `/digest/${input.issue.date}`)}
      preferencesUrl={capabilityLink(
        settings,
        "/preferences",
        input.preferencesToken,
      )}
      unsubscribeUrl={capabilityLink(
        settings,
        "/unsubscribe",
        input.unsubscribeToken,
      )}
      replyTo={settings.EMAIL_REPLY_TO}
      postalAddress={settings.POSTAL_ADDRESS}
    />,
  );
  return frozenEmailSchema.parse({
    idempotencyKey: `issue/${input.sendId}`,
    payload: {
      from: settings.EMAIL_FROM,
      to: [input.email],
      reply_to: settings.EMAIL_REPLY_TO,
      subject: emailSubject(`devup #${input.issue.id} · ${edition.title}`),
      html,
      text: plainText(html),
      headers: {
        "List-Unsubscribe": `<${capabilityLink(settings, "/api/unsubscribe", input.unsubscribeToken)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [
        { name: "send_id", value: input.sendId },
        { name: "kind", value: "issue" },
      ],
    },
  });
}
