import assert from "node:assert/strict";
import {
  getLocalizedIssueContent,
  issueContentSchema,
  parseIssueContent,
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

console.log(
  "Content checks passed: round trip, locales, and invalid-content rejection.",
);
