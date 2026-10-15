import assert from "node:assert/strict";
import {
  buildDraftPrompt,
  modelEvidencePassages,
  validateModelDraft,
} from "../lib/server/issues/draft-content";
import {
  generateBilingualDraft,
  GenerationFailure,
} from "../lib/server/issues/gemini";
import { generationEnvSchema } from "../lib/server/issues/generation-env";
import { draftFixture } from "./draft-fixture";

const fixture = draftFixture();
const env = generationEnvSchema.parse({
  GEMINI_API_KEY: "fixture-key-not-a-secret",
  GEMINI_MODEL: "fixture-primary",
  GEMINI_FALLBACK_MODEL: "fixture-fallback",
});
const pause = async () => {};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });

const validated = validateModelDraft(fixture.output, fixture.pool);
assert.equal(validated?.content.tr.news.length, 10);
assert.equal(validated?.content.mainStoryCount, 6);
for (const language of ["tr", "en"] as const) {
  const oversizedTitle = structuredClone(fixture.output);
  oversizedTitle[language].title = "x".repeat(81);
  assert.throws(() => validateModelDraft(oversizedTitle, fixture.pool));
}
const prompt = buildDraftPrompt(fixture.pool, "2099-04-01", [
  "Earlier headline about a database release",
]);
assert.ok(!prompt.includes("https://news.example.org/"));
assert.ok(prompt.includes("Earlier headline about a database release"));
assert.ok(prompt.includes('"publisher":"news.example.org"'));
assert.equal(
  validateModelDraft(fixture.output, fixture.pool)?.evidence[0].quote,
  modelEvidencePassages(fixture.pool[0])[0],
);
assert.ok(
  modelEvidencePassages(fixture.pool[0]).every((quote) =>
    fixture.pool[0].sourceText.includes(quote),
  ),
);
const mismatchedEvidence = structuredClone(fixture.output);
mismatchedEvidence.en.news[0].evidenceIndex = 1;
assert.throws(() => validateModelDraft(mismatchedEvidence, fixture.pool));
assert.throws(() => generationEnvSchema.parse({ GEMINI_API_KEY: "short" }));
assert.throws(() =>
  generationEnvSchema.parse({
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    GEMINI_MODEL: "../invalid",
  }),
);

for (const change of [
  (draft: typeof fixture.output) => {
    draft.en.news.reverse();
  },
  (draft: typeof fixture.output) => {
    draft.en.news[0].rawItemId = 999;
  },
  (draft: typeof fixture.output) => {
    draft.tr.news[0].evidenceIndex = 19;
  },
  (draft: typeof fixture.output) => {
    draft.featuredRawItemIds = [1, 1, 2];
  },
  (draft: typeof fixture.output) => {
    draft.tr.news.splice(5);
    draft.en.news.splice(5);
  },
  (draft: typeof fixture.output) => {
    draft.featuredRawItemIds = [1, 2, 9];
  },
  (draft: typeof fixture.output) => {
    draft.en.news[8].summary = "The release adds a typed interface. ".repeat(
      13,
    );
  },
  (draft: typeof fixture.output) => {
    draft.tr.news[2].summary =
      "The release adds a typed configuration interface and improves the error messages that are shown to developers.";
  },
  (draft: typeof fixture.output) => {
    draft.en.news[0].category = "community" as never;
    draft.tr.news[0].category = "community" as never;
  },
]) {
  const draft = structuredClone(fixture.output);
  change(draft);
  assert.throws(() => validateModelDraft(draft, fixture.pool));
}
assert.throws(() =>
  validateModelDraft(
    { ...fixture.output, url: "https://example.com" },
    fixture.pool,
  ),
);
const insufficient = {
  status: "insufficient",
  reason: "Not enough supported news",
  featuredRawItemIds: [],
  tr: { title: "", intro: "", news: [] },
  en: { title: "", intro: "", news: [] },
};
assert.equal(validateModelDraft(insufficient, fixture.pool), null);

let calls = 0;
const fetcher: typeof fetch = async (input, init) => {
  calls += 1;
  assert.ok(
    String(input).startsWith(
      "https://generativelanguage.googleapis.com/v1beta/models/",
    ),
  );
  assert.equal(
    new Headers(init?.headers).get("x-goog-api-key"),
    env.GEMINI_API_KEY,
  );
  assert.ok(String(init?.body).includes('"responseFormat"'));
  const body = JSON.parse(String(init?.body));
  assert.equal(
    body.generationConfig.responseFormat.text.mimeType,
    "APPLICATION_JSON",
  );
  return calls < 3
    ? new Response("unavailable", { status: 503 })
    : json(fixture.envelope);
};
const run = await generateBilingualDraft(fixture.pool, "2099-04-01", {
  env,
  fetcher,
  pause,
});
assert.equal(calls, 3);
assert.equal(run.model, "fixture-fallback");
assert.equal(run.attempts[2].totalTokens, 300);

for (const status of [400, 401, 403, 429]) {
  let count = 0;
  await assert.rejects(
    generateBilingualDraft(fixture.pool, "2099-04-01", {
      env,
      pause,
      fetcher: async () => {
        count += 1;
        return new Response("private provider detail", { status });
      },
    }),
    (error: unknown) =>
      error instanceof GenerationFailure &&
      error.code === `http_${status}` &&
      !error.message.includes("private provider detail"),
  );
  assert.equal(count, 1);
}

let missingCalls = 0;
const fallback = await generateBilingualDraft(fixture.pool, "2099-04-01", {
  env,
  pause,
  fetcher: async () => {
    missingCalls += 1;
    return missingCalls === 1
      ? new Response("missing", { status: 404 })
      : json(fixture.envelope);
  },
});
assert.equal(missingCalls, 2);
assert.equal(fallback.model, "fixture-fallback");
const blocked = { candidates: [{ finishReason: "SAFETY" }] };
await assert.rejects(
  generateBilingualDraft(fixture.pool, "2099-04-01", {
    env,
    pause,
    fetcher: async () => json(blocked),
  }),
  (error: unknown) =>
    error instanceof GenerationFailure &&
    error.code === "blocked" &&
    error.attempts.length === 1,
);
const stopped = await generateBilingualDraft(fixture.pool, "2099-04-01", {
  env,
  pause,
  fetcher: async () =>
    json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(insufficient) }] },
        },
      ],
    }),
});
assert.equal(stopped.draft, null);
assert.equal(stopped.attempts.length, 1);
await assert.rejects(
  generateBilingualDraft(fixture.pool, "2099-04-01", {
    env,
    pause,
    fetcher: async () =>
      new Response("x".repeat(400_001), {
        headers: { "Content-Type": "application/json" },
      }),
  }),
  (error: unknown) =>
    error instanceof GenerationFailure &&
    error.code === "response_too_large" &&
    error.attempts.length === 3,
);
const controller = new AbortController();
controller.abort();
await assert.rejects(
  generateBilingualDraft(fixture.pool, "2099-04-01", {
    env,
    pause,
    signal: controller.signal,
    fetcher,
  }),
  (error: unknown) =>
    error instanceof GenerationFailure && error.code === "deadline",
);
console.log("Draft validation and mocked Gemini checks passed");
