import assert from "node:assert/strict";
import { emailSubject, frozenEmailSchema } from "../lib/email/contracts";
import {
  renderConfirmationEmail,
  renderDigestEmail,
} from "../lib/email/render";
import {
  capabilityLink,
  emailAddressSchema,
  parseEmailSettings,
  siteLink,
} from "../lib/email/settings";
import { emailFixture } from "./email-fixture";
import { splitEditionStories } from "../types/issue-content";

const fixture = emailFixture();
assert.equal(
  emailSubject("devup #2 · Go 1.27 ve ajan altyapısı"),
  "devup #2 · Go 1.27 ve ajan altyapısı",
);
assert.equal(emailSubject("a".repeat(100)), "a".repeat(100));
const longSubject = emailSubject(
  "devup #2 · Pg_vectorsearch ile Hızlı Vektör Aramaları, Go 1.27'de HTTP/1 Bağlantı Yeniden Kullanımı ve Ajanlar İçin Altyapı Yönetimi",
);
assert.ok(longSubject.length <= 100);
assert.ok(longSubject.endsWith("…"));
assert.equal(
  emailSubject(`${"a".repeat(95)} trailingword`),
  `${"a".repeat(95)}…`,
);
assert.equal(emailSubject("devup\r\n#2"), "devup #2");
assert.equal(
  emailAddressSchema.parse(" Reader+tag@Example.COM "),
  "reader+tag@example.com",
);
assert.throws(() => emailAddressSchema.parse("a\r\nBcc: other@example.com"));
assert.throws(() =>
  parseEmailSettings({
    ...fixture.settings,
    EMAIL_FROM: "devup\r\nBcc: bad@example.com",
  }),
);
assert.throws(() =>
  parseEmailSettings(
    { ...fixture.settings, SITE_URL: "http://localhost:3000" },
    true,
  ),
);
assert.throws(() =>
  parseEmailSettings({
    ...fixture.settings,
    SITE_URL: "https://devup.example/path",
  }),
);
assert.throws(() => siteLink(fixture.settings, "//other.example/path"));
assert.throws(() => capabilityLink(fixture.settings, "/confirm", "bad&token"));

for (const language of ["en", "tr"] as const) {
  const confirmationInput = {
    sendId: fixture.sendId,
    email: fixture.email,
    language,
    token: fixture.token,
  };
  const confirmation = await renderConfirmationEmail(
    confirmationInput,
    fixture.settings,
  );
  const digestInput = {
    sendId: fixture.sendId,
    email: fixture.email,
    language,
    issue: fixture.issue,
    unsubscribeToken: fixture.unsubscribeToken,
    preferencesToken: fixture.preferencesToken,
  };
  const digest = await renderDigestEmail(digestInput, fixture.settings);
  assert.ok(
    digest.payload.subject.startsWith(
      `devup #${fixture.issue.editionNumber} ·`,
    ),
  );
  assert.ok(!digest.payload.subject.includes(`#${fixture.issue.id}`));
  const draft = await renderDigestEmail(
    {
      ...digestInput,
      issue: { ...fixture.issue, publishedAt: null, draft: true },
    },
    fixture.settings,
  );
  assert.ok(
    draft.payload.text.includes(
      language === "tr"
        ? "Taslak · sonraki sayı #2"
        : "Draft · next edition #2",
    ),
  );
  await assert.rejects(() =>
    renderDigestEmail(
      { ...digestInput, issue: { ...fixture.issue, editionNumber: undefined } },
      fixture.settings,
    ),
  );
  assert.match(confirmation.payload.html, new RegExp(`lang="${language}"`));
  assert.match(digest.payload.html, new RegExp(`lang="${language}"`));
  assert.ok(
    confirmation.payload.text.includes(`/confirm?token=${fixture.token}`),
  );
  assert.ok(digest.payload.text.includes(`/digest/${fixture.issue.date}`));
  assert.ok(
    digest.payload.text.includes(
      language === "tr" ? "Bu sayıda" : "In this edition",
    ),
  );
  assert.ok(
    digest.payload.text.includes(
      language === "tr" ? "Ana haberler" : "Main stories",
    ),
  );
  assert.ok(
    digest.payload.text.includes(
      language === "tr" ? "Kısa haberler" : "Brief updates",
    ),
  );
  assert.ok(
    digest.payload.text.includes(
      `/unsubscribe?token=${fixture.unsubscribeToken}`,
    ),
  );
  assert.ok(
    digest.payload.text.includes(
      `/preferences?token=${fixture.preferencesToken}`,
    ),
  );
  assert.equal(confirmation.payload.headers, undefined);
  assert.equal(
    digest.payload.headers?.["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assert.equal(
    digest.payload.headers?.["List-Unsubscribe"],
    `<https://devup.example/api/unsubscribe?token=${fixture.unsubscribeToken}>`,
  );
  assert.deepEqual(digest.payload.to, [fixture.email]);
  assert.ok(!JSON.stringify(digest.payload.tags).includes(fixture.email));
  assert.deepEqual(
    frozenEmailSchema.parse(JSON.parse(JSON.stringify(digest))),
    digest,
  );
  assert.equal(
    (await renderDigestEmail(digestInput, fixture.settings)).idempotencyKey,
    digest.idempotencyKey,
  );
  assert.throws(() =>
    frozenEmailSchema.parse({
      ...digest,
      payload: { ...digest.payload, to: [fixture.email, "other@example.com"] },
    }),
  );
  const { main } = splitEditionStories(
    fixture.issue.content[language].news,
    fixture.issue.content.featuredRawItemIds,
    fixture.issue.content.mainStoryCount,
  );
  for (const story of fixture.issue.content[language].news) {
    assert.equal(
      digest.payload.text.split(story.title).length - 1,
      main.some((item) => item.rawItemId === story.rawItemId) ? 2 : 1,
    );
    assert.ok(digest.payload.text.includes(story.url));
  }
  await assert.rejects(() =>
    renderDigestEmail(
      { ...digestInput, issue: { ...fixture.issue, publishedAt: null } },
      fixture.settings,
    ),
  );
  await assert.rejects(() =>
    renderDigestEmail(
      { ...digestInput, issue: { ...fixture.issue, date: "2099-02-30" } },
      fixture.settings,
    ),
  );
  const escapedIssue = structuredClone(fixture.issue);
  escapedIssue.content[language].news[0].title =
    '<script>alert("canary")</script>';
  const escaped = await renderDigestEmail(
    { ...digestInput, issue: escapedIssue },
    fixture.settings,
  );
  assert.ok(!escaped.payload.html.includes('<script>alert("canary")</script>'));
  assert.ok(escaped.payload.html.includes("&lt;script&gt;"));
  assert.ok(escaped.payload.text.includes('<script>alert("canary")</script>'));
}
console.log(
  "Bilingual HTML/text, links, escaping, headers and frozen payload checks passed; no email sent",
);
