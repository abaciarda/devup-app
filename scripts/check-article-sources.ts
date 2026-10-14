import assert from "node:assert/strict";
import {
  articleUrl,
  extractArticle,
  publicArticleAddress,
  readArticle,
  resolveArticleAddress,
  type ArticleTransport,
} from "../lib/server/sources/articles";
import { fetchSource } from "../lib/server/sources/adapters";
import { newsRejection } from "../lib/server/sources/text";
import { prepareCandidates } from "../lib/server/sources/candidates";

const text =
  "The software release adds a new compiler interface and improves memory safety. Developers can migrate existing projects with the documented compatibility guide. ".repeat(
    8,
  );
const html = `<html><body><nav>Navigation canary</nav><article><h1>Compiler release</h1><p>${text}</p><aside>Advertisement canary</aside><script>Script canary</script><div class="comments">Comment canary</div></article></body></html>`;
const signal = new AbortController().signal;
const extracted = extractArticle(html);
assert.ok(extracted.includes("Compiler release"));
assert.ok(extracted.includes("memory safety"));
assert.ok(!/canary/.test(extracted));
assert.throws(() => extractArticle(`<nav>${text}</nav><p>Headline only</p>`));
assert.throws(() => extractArticle("x".repeat(750_001)));
assert.ok(
  extractArticle(`<main><p>${text}</p></main>`).includes("memory safety"),
);
assert.ok(
  extractArticle(`<div class="markdown-body"><p>${text}</p></div>`).includes(
    "memory safety",
  ),
);
for (const url of [
  "http://github.com/release",
  "https://127.0.0.1/release",
  "https://github.com.evil.example/release",
  "https://user:pass@github.com/release",
  "https://github.com:8443/release",
  "https://unapproved.example/release",
])
  assert.throws(() => articleUrl(url));
for (const address of [
  "127.0.0.1",
  "10.0.0.1",
  "172.16.0.1",
  "192.168.0.1",
  "169.254.169.254",
  "100.64.0.1",
  "198.18.0.1",
  "203.0.113.1",
  "::1",
  "::ffff:127.0.0.1",
  "224.0.0.1",
])
  assert.equal(publicArticleAddress(address), false);
assert.equal(publicArticleAddress("8.8.8.8"), true);
await assert.rejects(() =>
  resolveArticleAddress("github.com", signal, async () => [
    { address: "127.0.0.1", family: 4 },
  ]),
);
await assert.rejects(() =>
  resolveArticleAddress("github.com", signal, async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]),
);
assert.equal(
  await resolveArticleAddress("github.com", signal, async () => [
    { address: "8.8.8.8", family: 4 },
  ]),
  "8.8.8.8",
);
const dnsController = new AbortController();
const dnsTimer = setTimeout(() => dnsController.abort(), 10);
try {
  await assert.rejects(() =>
    resolveArticleAddress(
      "github.com",
      dnsController.signal,
      () => new Promise(() => {}),
    ),
  );
} finally {
  clearTimeout(dnsTimer);
}
const transport: ArticleTransport = async () => ({
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" },
  body: html,
});
assert.equal(
  await readArticle("https://github.com/example/release", signal, transport),
  extracted,
);
let attempts = 0;
await assert.rejects(() =>
  readArticle("https://github.com/example/release", signal, async () => {
    attempts++;
    return {
      status: 302,
      headers: { location: "https://localhost/private" },
      body: "",
    };
  }),
);
assert.equal(attempts, 1);
await assert.rejects(() =>
  readArticle("https://github.com/example/release", signal, async () => ({
    status: 302,
    headers: { location: "/loop" },
    body: "",
  })),
);
await assert.rejects(() =>
  readArticle("https://github.com/example/release", signal, async () => ({
    status: 200,
    headers: { "content-type": "application/pdf" },
    body: text,
  })),
);
await assert.rejects(() =>
  readArticle("https://github.com/example/release", signal, async () => ({
    status: 200,
    headers: { "content-type": "text/html", "content-encoding": "gzip" },
    body: html,
  })),
);
const controller = new AbortController();
controller.abort();
await assert.rejects(() =>
  readArticle(
    "https://github.com/example/release",
    controller.signal,
    transport,
  ),
);
assert.equal(
  newsRejection("DEV Pet Corner: show us your pets", ["community"], text),
  "community_or_lifestyle",
);
assert.equal(
  newsRejection("I built an AI gardening app", ["ai"], text),
  "community_or_lifestyle",
);
assert.equal(
  newsRejection("How to build a compiler", ["programming"], text),
  "tutorial_or_personal_post",
);
assert.equal(
  newsRejection("Software release adds memory safety", ["rust"], text),
  null,
);
assert.equal(
  newsRejection("Researchers discover a compiler vulnerability", [], text),
  null,
);
const now = new Date("2026-10-14T12:00:00Z");
const json = (body: unknown) => Response.json(body);
const fetcher: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith("topstories.json")) return json([101, 102]);
  return json({
    id: url.includes("101") ? 101 : 102,
    type: "story",
    title: "Compiler security release",
    time: now.getTime() / 1000,
    score: 20,
    url: url.includes("101")
      ? "https://github.com/example/release"
      : "https://unapproved.example/release",
  });
};
const batch = await fetchSource("hackernews", 2, {
  now,
  signal,
  fetcher,
  articleReader: (url, abort) => readArticle(url, abort, transport),
});
assert.equal(batch.items.length, 1);
assert.ok(batch.items[0].excerpt.includes("memory safety"));
assert.equal(batch.exclusions?.publisher_not_supported, 1);
assert.equal(batch.rejected, 1);
const rows = [
  "https://dev.to/a/1",
  "https://dev.to/a/2",
  "https://github.com/a/release",
  "https://blog.rust-lang.org/release",
].map((url, index) => ({
  id: index + 1,
  externalId: String(index + 1),
  title: "Software release adds memory safety",
  originalUrl: url,
  normalizedUrl: url,
  excerpt: text,
  publishedAt: now,
  fetchedAt: now,
  score: 100 - index,
  tags: [],
  usedIssueId: null,
  source: { key: "hackernews", enabled: true },
}));
const pool = prepareCandidates(rows, new Set(), now);
assert.deepEqual(
  pool.map((row) => row.rawItemId),
  [1, 3, 4, 2],
);
assert.equal(pool[0].discussionUrl, "https://news.ycombinator.com/item?id=1");
console.log(
  "Article extraction, approved URLs, public DNS, bounded redirects/bodies, exclusions, editorial relevance and publisher diversity checks passed; no network calls.",
);
