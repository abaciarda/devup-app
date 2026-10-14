import assert from "node:assert/strict";
import { prepareCandidates } from "../lib/server/sources/candidates";
import { fetchSource } from "../lib/server/sources/adapters";
import { fetchSourceJson, SourceFetchError } from "../lib/server/sources/http";
import {
  hasUsefulSourceText,
  normalizeStoryUrl,
  plainSourceText,
} from "../lib/server/sources/text";

const now = new Date("2026-10-11T12:00:00.000Z");
const text =
  "The release adds documented improvements to the software platform and explains the tradeoffs developers should consider. ".repeat(
    8,
  );
const signal = new AbortController().signal;

const json = (value: unknown): Response =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });

const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(init?.redirect, "error");
  assert.equal(init?.cache, "no-store");
  assert.ok(init?.signal);
  if (url.pathname === "/v0/topstories.json") return json([101, 102, 103]);
  if (url.pathname === "/v0/item/101.json")
    return json({
      id: 101,
      type: "story",
      title: "Software release &amp; improvements",
      text: `<p>${text}</p>`,
      time: now.getTime() / 1000,
      score: 100,
      url: "https://example.com/release?utm_source=hn",
    });
  if (url.pathname === "/v0/item/102.json")
    return json({ id: 102, type: "comment" });
  if (url.pathname === "/v0/item/103.json")
    return json({ id: 103, deleted: true });
  if (url.pathname === "/api/articles")
    return json([
      {
        id: 201,
        title: "A new developer tool",
        url: "https://dev.to/example/tool",
        published_timestamp: now.toISOString(),
        tag_list: ["programming"],
        public_reactions_count: 5,
      },
    ]);
  if (url.pathname === "/api/articles/201")
    return json({
      id: 201,
      title: "A new developer tool",
      url: "https://dev.to/example/tool",
      published_timestamp: now.toISOString(),
      tag_list: "programming,tools",
      public_reactions_count: 5,
      body_html: `<p>${text}</p>`,
    });
  if (url.pathname === "/hottest.json")
    return json([
      {
        short_id: "abc123",
        created_at: now.toISOString(),
        title: "A software release",
        url: "https://example.com/release?utm_source=lobsters",
        score: 3,
        description_plain: text,
        tags: ["programming"],
      },
    ]);
  throw new Error("Unexpected fixture request");
};

const context = {
  now,
  signal,
  fetcher: fakeFetch,
  pause: async () => undefined,
};
const hn = await fetchSource("hackernews", 3, context);
const dev = await fetchSource("devto", 3, context);
const lob = await fetchSource("lobsters", 3, context);
assert.equal(hn.items.length, 1);
assert.equal(hn.rejected, 1);
assert.deepEqual(hn.retiredExternalIds, ["103"]);
assert.equal(hn.items[0].title, "Software release & improvements");
assert.equal(dev.items.length, 1);
assert.equal(hasUsefulSourceText(dev.items[0].excerpt), true);
assert.deepEqual(dev.items[0].tags, ["programming", "tools"]);
assert.equal(lob.items.length, 1);

assert.equal(
  normalizeStoryUrl("https://example.com/story?id=7&utm_source=feed"),
  "https://example.com/story?id=7",
);
assert.equal(
  normalizeStoryUrl("https://example.com/story?tag=a&tag=b#section"),
  "https://example.com/story?tag=a&tag=b#section",
);
assert.throws(() =>
  normalizeStoryUrl("https://user:password@example.com/story"),
);
assert.equal(
  plainSourceText("<p>Safe &amp; clear</p><script>ignore this</script>"),
  "Safe & clear",
);
assert.equal(hasUsefulSourceText("A headline only"), false);

const records = [...hn.items, ...dev.items, ...lob.items].map(
  (item, index) => ({
    id: index + 1,
    title: item.title,
    originalUrl: item.originalUrl,
    normalizedUrl: normalizeStoryUrl(item.originalUrl),
    excerpt: item.excerpt,
    publishedAt: item.publishedAt,
    fetchedAt: now,
    score: item.score,
    tags: item.tags,
    usedIssueId: null,
    source: { key: item.sourceKey, enabled: true },
  }),
);

assert.equal(prepareCandidates(records, new Set(), now).length, 2);
assert.equal(
  prepareCandidates(records, new Set(["https://example.com/release"]), now)
    .length,
  1,
);
assert.equal(
  prepareCandidates(
    records.map((row) => ({
      ...row,
      source: { ...row.source, enabled: false },
    })),
    new Set(),
    now,
  ).length,
  0,
);
assert.equal(
  prepareCandidates(
    records.map((row) => ({ ...row, publishedAt: new Date("2026-10-01") })),
    new Set(),
    now,
  ).length,
  0,
);
assert.equal(
  prepareCandidates(
    records.map((row) => ({
      ...row,
      fetchedAt: new Date("2026-10-11T09:00:00Z"),
    })),
    new Set(),
    now,
  ).length,
  0,
);

const badJson: typeof fetch = async () =>
  new Response("not-json", { headers: { "content-type": "application/json" } });
await assert.rejects(
  () =>
    fetchSourceJson("devto", "https://dev.to/api/articles", signal, badJson),
  SourceFetchError,
);
const oversized: typeof fetch = async () =>
  new Response("x".repeat(750_001), {
    headers: { "content-type": "application/json" },
  });
await assert.rejects(
  () =>
    fetchSourceJson("devto", "https://dev.to/api/articles", signal, oversized),
  SourceFetchError,
);

let requests = 0;
const limited: typeof fetch = async (input, init) => {
  requests += 1;
  if (new URL(String(input)).pathname === "/api/articles")
    return fakeFetch(input, init);
  return new Response("", { status: 429, headers: { "retry-after": "30" } });
};
const rateLimited = await fetchSource("devto", 3, {
  ...context,
  fetcher: limited,
});
assert.deepEqual(rateLimited.errors, ["http_429:retry_after=30s"]);
assert.equal(requests, 2);

const controller = new AbortController();
controller.abort();
await assert.rejects(() =>
  fetchSourceJson(
    "devto",
    "https://dev.to/api/articles",
    controller.signal,
    fakeFetch,
  ),
);

console.log(
  "Source checks passed: provider parsing, bounded HTTP, URL identity, and candidate eligibility.",
);
