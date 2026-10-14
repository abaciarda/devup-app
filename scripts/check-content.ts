import assert from "node:assert/strict";
import {
  getLocalizedIssueContent,
  issueContentSchema,
  parseIssueContent,
  splitEditionStories,
  type IssueContent,
} from "../types/issue-content";
import { makeExampleContent } from "./content-fixture";

function rejects(label: string, change: (content: IssueContent) => void): void {
  const content = structuredClone(makeExampleContent());
  change(content);
  assert.equal(issueContentSchema.safeParse(content).success, false, label);
}

const valid = makeExampleContent();
const roundTrip = parseIssueContent(JSON.parse(JSON.stringify(valid)));

assert.deepEqual(roundTrip, valid);
assert.equal(getLocalizedIssueContent(valid, "tr").title, valid.tr.title);
assert.equal(getLocalizedIssueContent(valid, "en").title, valid.en.title);

rejects("Unsafe link scheme", (content) => {
  content.tr.news[0].url = "javascript:alert(1)";
  content.en.news[0].url = "javascript:alert(1)";
});

rejects("Duplicate selected news", (content) => {
  content.tr.news[1] = structuredClone(content.tr.news[0]);
  content.en.news[1] = structuredClone(content.en.news[0]);
});

rejects("Different order between languages", (content) => {
  [content.en.news[0], content.en.news[1]] = [
    content.en.news[1],
    content.en.news[0],
  ];
});

rejects("Featured item outside selection", (content) => {
  content.featuredRawItemIds[2] = 999;
});

rejects("Duplicate featured item", (content) => {
  content.featuredRawItemIds[1] = content.featuredRawItemIds[0];
});

rejects("Too few news stories", (content) => {
  content.tr.news.pop();
  content.en.news.pop();
});

assert.equal(
  issueContentSchema.safeParse({ ...valid, unexpected: true }).success,
  false,
  "Unexpected content property",
);

const legacy = splitEditionStories(valid.en.news, [3, 1, 2]);
assert.deepEqual(
  legacy.main.map((story) => story.rawItemId),
  [1, 2, 3],
);
assert.deepEqual(
  legacy.briefs.map((story) => story.rawItemId),
  [4, 5],
);

const full = makeExampleContent([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const sixAndFour = parseIssueContent({ ...full, mainStoryCount: 6 });
const split = splitEditionStories(
  sixAndFour.tr.news,
  sixAndFour.featuredRawItemIds,
  sixAndFour.mainStoryCount,
);
assert.equal(split.main.length, 6);
assert.deepEqual(
  split.briefs.map((story) => story.rawItemId),
  [7, 8, 9, 10],
);
assert.equal(
  issueContentSchema.safeParse({
    ...full,
    mainStoryCount: 6,
    featuredRawItemIds: [1, 2, 9],
  }).success,
  false,
  "Featured story outside the main section",
);
assert.equal(
  issueContentSchema.safeParse({ ...full, mainStoryCount: 5 }).success,
  false,
  "More than four brief stories",
);
assert.equal(
  issueContentSchema.safeParse({
    ...valid,
    mainStoryCount: 6,
  }).success,
  false,
  "Main section longer than the edition",
);
const extra = (story: IssueContent["en"]["news"][number]) => ({
  ...story,
  rawItemId: 11,
  url: "https://example.com/task-02/story-11",
});
assert.equal(
  issueContentSchema.safeParse({
    ...full,
    tr: { ...full.tr, news: [...full.tr.news, extra(full.tr.news[0])] },
    en: { ...full.en, news: [...full.en.news, extra(full.en.news[0])] },
  }).success,
  false,
  "More than ten stories",
);

console.log(
  "Content checks passed: round trip, locales, and invalid-content rejection.",
);
