import assert from "node:assert/strict";
import {
  featuredStories,
  parseArchiveCursor,
  parsePublicIssue,
  storyForCard,
  summarizeIssue,
} from "../lib/public-issues";
import { validateModelDraft } from "../lib/server/issues/draft-content";
import { draftFixture } from "./draft-fixture";

const fixture = draftFixture();
fixture.output.featuredRawItemIds = [5, 3, 1];
const draft = validateModelDraft(fixture.output, fixture.pool);
assert.ok(draft);
const row = {
  id: 123,
  editionNumber: 2,
  editionDate: new Date("2099-08-01T00:00:00.000Z"),
  publishedAt: new Date("2099-08-01T09:00:00.000Z"),
  content: draft.content,
};
const issue = parsePublicIssue(row);
assert.equal(issue.date, "2099-08-01");
assert.equal(issue.id, 123);
assert.equal(issue.editionNumber, 2);
assert.equal(summarizeIssue(issue).editionNumber, 2);
assert.throws(() => parsePublicIssue({ ...row, editionNumber: null }));
assert.deepEqual(
  featuredStories(issue, "en").map((story) => story.rawItemId),
  [5, 3, 1],
);
assert.deepEqual(
  featuredStories(issue, "tr").map((story) => story.rawItemId),
  [5, 3, 1],
);
assert.equal(summarizeIssue(issue).titles.tr, draft.content.tr.title);
assert.equal(storyForCard(issue.content.en.news[0], "en").source, "Dev.to");
assert.equal(storyForCard(issue.content.tr.news[0], "tr").topic, "Araçlar");
assert.throws(() => parsePublicIssue({ ...row, publishedAt: null }));
assert.throws(() =>
  parsePublicIssue({ ...row, generationError: "private canary" }),
);
assert.throws(() => parsePublicIssue({ ...row, content: { invalid: true } }));
assert.equal(parseArchiveCursor(undefined, undefined), null);
assert.deepEqual(parseArchiveCursor("2099-08-01", undefined), {
  direction: "before",
  date: "2099-08-01",
});
assert.deepEqual(parseArchiveCursor(undefined, "2099-08-01"), {
  direction: "after",
  date: "2099-08-01",
});
assert.throws(() => parseArchiveCursor("2099-02-30", undefined));
assert.throws(() => parseArchiveCursor(["2099-08-01"], undefined));
assert.throws(() => parseArchiveCursor("2099-08-01", "2099-08-02"));
console.log(
  "Public content, featured identity, language mapping and cursor checks passed",
);
