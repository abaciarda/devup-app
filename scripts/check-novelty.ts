import assert from "node:assert/strict";
import {
  coverageUrl,
  filterNovelCandidates,
  loadRecentCoverage,
  validateNoveltyDecisions,
  type CoveredStory,
} from "../lib/server/issues/novelty";
import { GenerationFailure } from "../lib/server/issues/gemini";
import { generationEnvSchema } from "../lib/server/issues/generation-env";
import { validateModelDraft } from "../lib/server/issues/draft-content";
import { minimumEditionStories } from "../lib/server/sources/candidates";
import { draftFixture } from "./draft-fixture";

const fixture = draftFixture();
const pool = structuredClone(fixture.pool.slice(0, 6));
pool[0].title =
  "NIST curve seeds: another explanation of the origins discovery";
pool[0].originalUrl = "https://words.filippo.io/seeds-solved/";
pool[0].sourceText =
  "Anthropic researchers established that the NIST elliptic-curve seeds came from drand48 initialized with historical Unix timestamps.";

const updateQuote =
  "The project released a patch for a newly identified vulnerability affecting version 2.0.";
pool[1].sourceText = `${updateQuote} This sentence describes a fictional update used only in a test fixture.`;

const history: CoveredStory[] = [
  {
    key: "187:700",
    editionDate: "2026-10-17",
    title: "Researchers explain the origin of NIST elliptic-curve seeds",
    summary:
      "Anthropic researchers traced the NIST P-192, P-224, P-256, P-384 and P-521 seeds to drand48 initialized with Unix timestamps. This is the origins discovery, not a newly exploitable weakness.",
    url: "https://www.anthropic.com/research/ecdsa-curve-origins",
  },
];

const decisions = pool.map((candidate) => ({
  rawItemId: candidate.rawItemId,
  verdict: "new_event",
  relatedHistoryKey: null as string | null,
  relatedCandidateId: null as number | null,
  changeEvidence: null as string | null,
}));
decisions[0] = {
  ...decisions[0],
  verdict: "repeat",
  relatedHistoryKey: history[0].key,
};
decisions[1] = {
  ...decisions[1],
  verdict: "material_update",
  relatedHistoryKey: history[0].key,
  changeEvidence: updateQuote,
};
decisions[2] = {
  ...decisions[2],
  verdict: "repeat",
  relatedCandidateId: pool[3].rawItemId,
};
decisions[4] = { ...decisions[4], verdict: "uncertain" };

const review = { decisions };
const selected = validateNoveltyDecisions(review, pool, history);
assert.deepEqual(
  selected.map((candidate) => candidate.rawItemId),
  [2, 4, 6],
);
assert.ok(selected.length < minimumEditionStories);

const duplicateId = structuredClone(review);
duplicateId.decisions[1].rawItemId = duplicateId.decisions[0].rawItemId;
assert.throws(() => validateNoveltyDecisions(duplicateId, pool, history));

const omitted = { decisions: decisions.slice(1) };
assert.throws(() => validateNoveltyDecisions(omitted, pool, history));

const inventedHistory = structuredClone(review);
inventedHistory.decisions[0].relatedHistoryKey = "unknown:999";
assert.deepEqual(
  validateNoveltyDecisions(inventedHistory, pool, history).map(
    (item) => item.rawItemId,
  ),
  [2, 4, 6],
);

const inventedQuote = structuredClone(review);
inventedQuote.decisions[1].changeEvidence =
  "This invented source passage does not occur in the candidate text.";
assert.deepEqual(
  validateNoveltyDecisions(inventedQuote, pool, history).map(
    (item) => item.rawItemId,
  ),
  [4, 6],
);

const cycle = structuredClone(review);
cycle.decisions[2].relatedCandidateId = pool[3].rawItemId;
cycle.decisions[3] = {
  ...cycle.decisions[3],
  verdict: "repeat",
  relatedCandidateId: pool[2].rawItemId,
};
assert.deepEqual(
  validateNoveltyDecisions(cycle, pool, history).map((item) => item.rawItemId),
  [2, 6],
);

const invalidNew = structuredClone(review);
invalidNew.decisions[3].relatedHistoryKey = history[0].key;
assert.deepEqual(
  validateNoveltyDecisions(invalidNew, pool, history).map(
    (item) => item.rawItemId,
  ),
  [2, 6],
);

const invalidReference = structuredClone(review);
invalidReference.decisions[3].relatedCandidateId = pool[3].rawItemId;
assert.deepEqual(
  validateNoveltyDecisions(invalidReference, pool, history).map(
    (item) => item.rawItemId,
  ),
  [2, 6],
);

assert.throws(
  () => validateNoveltyDecisions({ decisions: "invalid" }, pool, history),
  (error: unknown) =>
    error instanceof GenerationFailure &&
    error.code === "novelty_response_invalid_schema",
);

assert.equal(
  coverageUrl("https://example.org/story?utm_source=hn#discussion"),
  "https://example.org/story",
);

const env = generationEnvSchema.parse({
  GEMINI_API_KEY: "fixture-key-not-a-secret",
  GEMINI_MODEL: "fixture-primary",
  GEMINI_FALLBACK_MODEL: "fixture-reviewer",
});

const exactRepeat = {
  ...pool[0],
  rawItemId: 900,
  originalUrl: `${history[0].url}?utm_source=lobsters#comments`,
};
let calls = 0;
const filtered = await filterNovelCandidates([...pool, exactRepeat], history, {
  env,
  fetcher: async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body));
    const prompt = body.contents[0].parts[0].text as string;
    assert.ok(prompt.includes(history[0].summary));
    assert.ok(!prompt.includes('"rawItemId":900'));
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(review) }] },
        },
      ],
    });
  },
});
assert.equal(calls, 1);
assert.deepEqual(
  filtered.map((candidate) => candidate.rawItemId),
  [2, 4, 6],
);

assert.deepEqual(
  await filterNovelCandidates([exactRepeat], history, {
    env,
    fetcher: async () =>
      assert.fail("An exact repeat should not call the provider"),
  }),
  [],
);

let failedCalls = 0;
await assert.rejects(
  filterNovelCandidates(pool, history, {
    env,
    fetcher: async () => {
      failedCalls += 1;
      return new Response("private provider response", { status: 429 });
    },
  }),
  (error: unknown) =>
    error instanceof GenerationFailure &&
    error.code === "novelty_review_failed" &&
    !error.message.includes("private provider response"),
);
assert.equal(failedCalls, 1);

await assert.rejects(
  filterNovelCandidates(pool, history, {
    env,
    fetcher: async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(omitted) }] },
          },
        ],
      }),
  }),
  (error: unknown) =>
    error instanceof GenerationFailure &&
    error.code === "novelty_response_invalid_candidate_ids",
);

let query: unknown;
const stored = validateModelDraft(fixture.output, fixture.pool);
assert.ok(stored);
const client = {
  issue: {
    findMany: async (input: unknown) => {
      query = input;
      return [
        {
          id: 187,
          editionDate: new Date("2026-10-17T00:00:00Z"),
          content: stored.content,
        },
      ];
    },
  },
} as unknown as NonNullable<Parameters<typeof loadRecentCoverage>[2]>;
const covered = await loadRecentCoverage(
  188,
  new Date("2026-10-18T00:00:00Z"),
  client,
);
assert.equal(covered.length, 10);
assert.deepEqual(query, {
  where: {
    id: { not: 188 },
    publishedAt: { not: null },
    editionDate: {
      gte: new Date("2026-10-11T00:00:00Z"),
      lt: new Date("2026-10-18T00:00:00Z"),
    },
  },
  orderBy: { editionDate: "desc" },
  select: { id: true, editionDate: true, content: true },
});

console.log("Novelty guard checks passed");
