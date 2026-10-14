import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashAdminPassword } from "../lib/server/admin-credentials";
import { adminEnvSchema } from "../lib/server/admin-env";
import {
  authorizeAdminMutation,
  mutationNoticeText,
  readMutationForm,
} from "../lib/server/admin-mutations";
import {
  adminCookieName,
  createAdminSession,
} from "../lib/server/admin-session";
import { validateModelDraft } from "../lib/server/draft-content";
import {
  issueReviewVersion,
  publicationApprovalSchema,
  sourceSwitchSchema,
} from "../lib/server/publication";
import { draftFixture } from "./draft-fixture";

const env = adminEnvSchema.parse({
  SITE_URL: "http://localhost:3000",
  ADMIN_PASSWORD_HASH: await hashAdminPassword(
    "fixture-only-password-never-use",
  ),
  SESSION_SECRET: randomBytes(32).toString("base64url"),
});
process.env.SITE_URL = env.SITE_URL;
process.env.ADMIN_PASSWORD_HASH = env.ADMIN_PASSWORD_HASH;
process.env.SESSION_SECRET = env.SESSION_SECRET;
const fixture = draftFixture();
const draft = validateModelDraft(fixture.output, fixture.pool);
assert.ok(draft);
const date = new Date("2099-04-01T09:00:00.000Z");
const version = issueReviewVersion(draft.content, date);
assert.match(version, /^[a-f0-9]{64}$/);
assert.equal(issueReviewVersion(structuredClone(draft.content), date), version);
assert.notEqual(
  issueReviewVersion(draft.content, new Date(date.getTime() + 1)),
  version,
);
const changed = structuredClone(draft.content);
changed.en.intro = "A changed English introduction for this edition.";
assert.notEqual(issueReviewVersion(changed, date), version);
assert.throws(() =>
  publicationApprovalSchema.parse({
    issueId: 1,
    reviewVersion: version,
    reviewedTr: true,
    reviewedEn: false,
  }),
);
assert.throws(() =>
  sourceSwitchSchema.parse({ sourceKey: "jobs", enabled: true }),
);
assert.throws(() =>
  sourceSwitchSchema.parse({ sourceKey: "devto", enabled: "false" }),
);
assert.equal(mutationNoticeText("unknown notice <script>"), null);
assert.ok(mutationNoticeText("review_changed")?.includes("changed"));

const cookie = `${adminCookieName()}=${createAdminSession(env)}`;
const request = (
  origin: string,
  token: string | undefined = cookie,
  body = "sourceKey=devto&enabled=false",
) =>
  new NextRequest(`${env.SITE_URL}/api/admin/sources`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(token ? { Cookie: token } : {}),
    },
    body,
  });
assert.equal(authorizeAdminMutation(request(env.SITE_URL)), null);
assert.equal(
  authorizeAdminMutation(request("https://other.example"))?.status,
  403,
);
assert.equal(authorizeAdminMutation(request(env.SITE_URL, ""))?.status, 401);
assert.equal(
  authorizeAdminMutation(request(env.SITE_URL, `${adminCookieName()}=forged`))
    ?.status,
  401,
);
assert.deepEqual(await readMutationForm(request(env.SITE_URL)), {
  sourceKey: "devto",
  enabled: "false",
});
assert.equal(
  await readMutationForm(
    request(env.SITE_URL, cookie, "enabled=true&enabled=false"),
  ),
  null,
);
assert.equal(
  await readMutationForm(
    request(env.SITE_URL, cookie, "x=" + "a".repeat(8193)),
  ),
  null,
);
console.log(
  "Publication approval, review revisions, mutation authorization and form checks passed",
);
