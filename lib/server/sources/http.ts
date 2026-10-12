import "server-only";
import { parseSourceFetchUrl, type SourceKey } from "../validation";

export class SourceFetchError extends Error {
  constructor(
    public readonly kind:
      "http" | "content_type" | "too_large" | "invalid_json",
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(`Source request failed: ${kind}`);
    this.name = "SourceFetchError";
  }
}

export function sourceErrorCode(error: unknown): string {
  if (error instanceof SourceFetchError) {
    const code =
      error.status === undefined ? error.kind : `http_${error.status}`;
    return error.retryAfterSeconds === undefined
      ? code
      : `${code}:retry_after=${error.retryAfterSeconds}s`;
  }

  if (
    error instanceof Error &&
    ["AbortError", "TimeoutError"].includes(error.name)
  ) {
    return "timeout";
  }

  return "invalid_response_or_network_error";
}

export async function fetchSourceJson(
  sourceKey: SourceKey,
  input: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const url = parseSourceFetchUrl(sourceKey, input);
  signal.throwIfAborted();

  const response = await fetcher(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    headers: {
      "User-Agent": "devup/0.1 (technology-news newsletter)",
      Accept:
        sourceKey === "devto"
          ? "application/vnd.forem.api-v1+json"
          : "application/json",
    },
  });

  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const numeric = retry === null ? NaN : Number(retry);
    const seconds = Number.isFinite(numeric)
      ? numeric
      : Math.ceil((Date.parse(retry ?? "") - Date.now()) / 1000);
    const retryAfterSeconds =
      Number.isFinite(seconds) && seconds >= 0
        ? Math.min(86_400, Math.ceil(seconds))
        : undefined;
    await response.body?.cancel().catch(() => undefined);
    throw new SourceFetchError("http", response.status, retryAfterSeconds);
  }

  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    .trim();
  if (contentType !== "application/json" && !contentType?.endsWith("+json")) {
    await response.body?.cancel().catch(() => undefined);
    throw new SourceFetchError("content_type");
  }

  const maxBytes = 750_000;
  const advertisedSize = Number(response.headers.get("content-length"));
  if (advertisedSize > maxBytes || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new SourceFetchError("too_large");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new SourceFetchError("too_large");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new SourceFetchError("invalid_json");
  }
}
