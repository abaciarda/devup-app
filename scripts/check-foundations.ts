import assert from "node:assert/strict";
import {
  editionDateForNow,
  editionDateFromKey,
  editionDateKey,
} from "../lib/edition-date";
import {
  constantTimeEqual,
  hasBearerToken,
  hashToken,
  isSameOrigin,
  randomToken,
} from "../lib/server/shared/security";
import {
  parseSourceFetchUrl,
  rawItemInputSchema,
} from "../lib/server/shared/validation";

assert.equal(editionDateKey(new Date("2026-10-11T20:59:59Z")), "2026-10-11");
assert.equal(editionDateKey(new Date("2026-10-11T21:00:00Z")), "2026-10-12");
assert.equal(
  editionDateForNow(new Date("2026-10-11T21:00:00Z")).toISOString(),
  "2026-10-12T00:00:00.000Z",
);
assert.equal(editionDateFromKey("2028-02-29").getUTCDate(), 29);
assert.throws(() => editionDateFromKey("2026-02-29"));
assert.throws(() => editionDateFromKey("2026-02-30"));
assert.throws(() => editionDateFromKey("2026-2-01"));
assert.throws(() => editionDateKey(new Date("invalid")));

const token = randomToken();
assert.match(token, /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(randomToken(), token);
assert.equal(constantTimeEqual(token, token), true);
assert.equal(constantTimeEqual(token, `${token}x`), false);
assert.equal(constantTimeEqual("", ""), false);
assert.match(hashToken(token), /^[a-f0-9]{64}$/);

assert.equal(
  hasBearerToken(new Headers({ authorization: `Bearer ${token}` }), token),
  true,
);
assert.equal(hasBearerToken(new Headers(), token), false);
assert.equal(
  hasBearerToken(
    new Headers({ authorization: `Bearer ${randomToken()}` }),
    token,
  ),
  false,
);
assert.equal(
  hasBearerToken(new Headers({ authorization: "Bearer short" }), "short"),
  false,
);

assert.equal(
  isSameOrigin(
    new Headers({ origin: "https://devup.example" }),
    "https://devup.example/",
  ),
  true,
);
assert.equal(
  isSameOrigin(
    new Headers({ origin: "https://other.example" }),
    "https://devup.example/",
  ),
  false,
);
assert.equal(isSameOrigin(new Headers(), "https://devup.example/"), false);

assert.equal(
  parseSourceFetchUrl(
    "hackernews",
    "https://hacker-news.firebaseio.com/v0/topstories.json",
  ).hostname,
  "hacker-news.firebaseio.com",
);
assert.equal(
  parseSourceFetchUrl("devto", "https://dev.to/api/articles").hostname,
  "dev.to",
);
assert.equal(
  parseSourceFetchUrl("lobsters", "https://lobste.rs/hottest.json").hostname,
  "lobste.rs",
);
assert.throws(() => parseSourceFetchUrl("devto", "http://dev.to/api/articles"));
assert.throws(() =>
  parseSourceFetchUrl("devto", "https://dev.to.evil.example/api/articles"),
);
assert.throws(() =>
  parseSourceFetchUrl("devto", "https://user:password@dev.to/api/articles"),
);
assert.throws(() =>
  parseSourceFetchUrl("devto", "https://dev.to:8443/api/articles"),
);
assert.throws(() =>
  parseSourceFetchUrl("devto", "https://127.0.0.1/api/articles"),
);

const item = rawItemInputSchema.parse({
  sourceKey: "hackernews",
  externalId: "123",
  title: " Example story ",
  originalUrl: "https://example.com/story",
});

assert.equal(item.title, "Example story");
assert.equal(item.excerpt, "");
assert.equal(item.publishedAt, null);
assert.deepEqual(item.tags, []);
assert.equal(
  rawItemInputSchema.safeParse({ ...item, sourceKey: "unknown" }).success,
  false,
);
assert.equal(
  rawItemInputSchema.safeParse({ ...item, usedIssueId: 1 }).success,
  false,
);
assert.equal(
  rawItemInputSchema.safeParse({ ...item, score: Infinity }).success,
  false,
);

console.log(
  "Foundation checks passed: dates, input validation, tokens, origins, and fetch hosts.",
);
