import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { Candidate } from "./candidates";
import {
  buildDraftPrompt,
  modelJsonSchema,
  type ValidatedDraft,
  validateModelDraft,
} from "./draft-content";
import {
  type GenerationEnv,
  generationEnv,
  generationEnvSchema,
} from "./generation-env";

export const attemptSchema = z.strictObject({
  model: z.string().min(1).max(100),
  modelVersion: z.string().max(200).nullable(),
  code: z.string().max(100),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
});

export type GenerationAttempt = z.infer<typeof attemptSchema>;

export type GenerationRun = {
  draft: ValidatedDraft | null;
  model: string;
  attempts: GenerationAttempt[];
};

export class GenerationFailure extends Error {
  constructor(
    public readonly code: string,
    public readonly attempts: GenerationAttempt[] = [],
  ) {
    super(`Draft generation failed: ${code}`);
    this.name = "GenerationFailure";
  }
}

const envelopeSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string(),
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                }),
              )
              .max(50),
          })
          .optional(),
      }),
    )
    .max(1)
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  modelVersion: z.string().max(200).optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().int().nonnegative().optional(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      totalTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

async function readJson(response: Response): Promise<unknown> {
  const limit = 400_000;
  if (!response.headers.get("content-type")?.includes("application/json")) {
    await response.body?.cancel();
    throw new GenerationFailure("invalid_response");
  }
  if (
    Number(response.headers.get("content-length")) > limit ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new GenerationFailure("response_too_large");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new GenerationFailure("response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function generateBilingualDraft(
  pool: Candidate[],
  editionKey: string,
  options: {
    env?: GenerationEnv;
    fetcher?: typeof fetch;
    pause?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
    signal?: AbortSignal;
  } = {},
): Promise<GenerationRun> {
  if (pool.length < 5) throw new GenerationFailure("insufficient_candidates");
  const env = generationEnvSchema.parse(options.env ?? generationEnv());
  const fetcher = options.fetcher ?? fetch;
  const pause =
    options.pause ?? ((ms, signal) => delay(ms, undefined, { signal }));
  const signal = AbortSignal.any([
    AbortSignal.timeout(150_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const prompt = buildDraftPrompt(pool, editionKey);
  const models = [env.GEMINI_MODEL, env.GEMINI_MODEL];
  if (env.GEMINI_FALLBACK_MODEL !== env.GEMINI_MODEL)
    models.push(env.GEMINI_FALLBACK_MODEL);
  const attempts: GenerationAttempt[] = [];

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const attempt: GenerationAttempt = {
      model,
      modelVersion: null,
      code: "pending",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };
    try {
      signal.throwIfAborted();
      if (index > 0) await pause(index === 1 ? 2000 : 4000, signal);
      const response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.any([signal, AbortSignal.timeout(40_000)]),
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 16_384,
              responseFormat: {
                text: { mimeType: "APPLICATION_JSON", schema: modelJsonSchema },
              },
            },
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new GenerationFailure(`http_${response.status}`);
      }
      const envelope = envelopeSchema.parse(await readJson(response));
      attempt.modelVersion = envelope.modelVersion ?? null;
      attempt.inputTokens = envelope.usageMetadata?.promptTokenCount ?? null;
      attempt.outputTokens =
        envelope.usageMetadata?.candidatesTokenCount ?? null;
      attempt.totalTokens = envelope.usageMetadata?.totalTokenCount ?? null;
      if (envelope.promptFeedback?.blockReason)
        throw new GenerationFailure("blocked");
      const candidate = envelope.candidates?.[0];
      if (!candidate) throw new GenerationFailure("invalid_response");
      if (candidate.finishReason !== "STOP") {
        throw new GenerationFailure(
          candidate.finishReason === "MAX_TOKENS" ? "truncated" : "blocked",
        );
      }
      const answer =
        candidate.content?.parts
          .filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join("") ?? "";
      const draft = validateModelDraft(JSON.parse(answer), pool);
      attempt.code = draft ? "ok" : "insufficient_supported_content";
      attempts.push(attempt);
      return { draft, model, attempts };
    } catch (error) {
      const code = signal.aborted
        ? "deadline"
        : error instanceof GenerationFailure
          ? error.code
          : "invalid_response_or_network";
      attempt.code = code;
      attempts.push(attempt);
      if (
        code === "blocked" ||
        code === "deadline" ||
        (/^http_4\d\d$/.test(code) && code !== "http_404")
      ) {
        throw new GenerationFailure(code, attempts);
      }
      if (code === "http_404" && index === 0) index = 1;
      if (index === models.length - 1)
        throw new GenerationFailure(code, attempts);
    }
  }
  throw new GenerationFailure("model_unavailable", attempts);
}
