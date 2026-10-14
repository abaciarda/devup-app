import { issueContentSchema } from "../types/issue-content";
import { parseEmailSettings } from "../lib/email/settings";
import { draftFixture } from "./draft-fixture";

export function emailFixture() {
  const fixture = draftFixture();
  const localize = (language: "tr" | "en") => ({
    title: fixture.output[language].title,
    intro: fixture.output[language].intro,
    news: fixture.output[language].news.map((story, index) => ({
      rawItemId: story.rawItemId,
      category: story.category,
      title: story.title,
      summary: story.summary,
      sourceKey: fixture.pool[index].sourceKey,
      url: fixture.pool[index].originalUrl,
    })),
  });
  return {
    settings: parseEmailSettings({
      SITE_URL: "https://devup.example",
      EMAIL_FROM: "devup <news@devup.example>",
      EMAIL_REPLY_TO: "hello@devup.example",
      POSTAL_ADDRESS: "Example operator, Example Street 1, Istanbul, Türkiye",
    }),
    issue: {
      id: 123,
      date: "2099-04-01",
      publishedAt: new Date("2099-04-01T09:00:00.000Z"),
      content: issueContentSchema.parse({
        version: 1,
        featuredRawItemIds: fixture.output.featuredRawItemIds,
        tr: localize("tr"),
        en: localize("en"),
      }),
    },
    sendId: "bdbf05ef-0bba-4c08-a652-187fd88b7031",
    email: "reader@example.com",
    token: "fixture_token_never_use_01234567890123456789012",
    unsubscribeToken: "fixture_unsubscribe_never_use_0123456789012345",
    preferencesToken: "fixture_preferences_never_use_0123456789012345",
  };
}
