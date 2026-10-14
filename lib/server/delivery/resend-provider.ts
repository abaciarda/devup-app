import "server-only";
import { z } from "zod";
import { frozenEmailSchema, type FrozenEmail } from "../../email/contracts";

export type ProviderOutcome =
  | { kind: "accepted"; providerId: string }
  | { kind: "rejected"; code: string; retryable: boolean; retryAfter: number }
  | { kind: "unknown"; code: string; retryable: boolean; retryAfter: number };
export type EmailProvider = (message: FrozenEmail) => Promise<ProviderOutcome>;

async function readJson(response: Response, limit = 65_536): Promise<unknown> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Provider response too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function retrieveResendEmail(providerId: string, apiKey: string) {
  z.uuid().parse(providerId);
  if (!/^re_[A-Za-z0-9_-]+$/.test(apiKey))
    throw new Error("Invalid provider credentials");
  const response = await fetch(`https://api.resend.com/emails/${providerId}`, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("Provider reconciliation unavailable");
  return z
    .object({
      id: z.uuid(),
      to: z.array(z.string()).length(1),
      from: z.string(),
      subject: z.string(),
      last_event: z.string(),
      tags: z.array(z.object({ name: z.string(), value: z.string() })),
    })
    .parse(await readJson(response, 200_000));
}

export function resendProvider(
  apiKey: string,
  transport: typeof fetch = fetch,
): EmailProvider {
  if (!/^re_[A-Za-z0-9_-]+$/.test(apiKey))
    throw new Error("Invalid provider credentials");
  return async (value) => {
    const message = frozenEmailSchema.parse(value);
    try {
      const response = await transport("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify(message.payload),
      });
      const retryHeader = response.headers.get("retry-after");
      const retryAfter = Math.min(
        86400,
        Math.max(
          60,
          Number(retryHeader) ||
            Math.ceil((Date.parse(retryHeader ?? "") - Date.now()) / 1000) ||
            60,
        ),
      );
      const body = await readJson(response).catch(() => null);
      const accepted = z.object({ id: z.uuid() }).safeParse(body);
      if (response.ok && accepted.success)
        return { kind: "accepted", providerId: accepted.data.id };
      if (response.ok || response.status >= 500 || response.status === 408)
        return {
          kind: "unknown",
          code: "provider_uncertain",
          retryable: true,
          retryAfter,
        };
      const error = z.object({ name: z.string() }).safeParse(body);
      if (response.status === 409)
        return {
          kind: "unknown",
          code:
            error.success &&
            error.data.name === "concurrent_idempotent_requests"
              ? "concurrent_request"
              : "idempotency_conflict",
          retryable:
            error.success &&
            error.data.name === "concurrent_idempotent_requests",
          retryAfter,
        };
      return {
        kind: "rejected",
        code:
          response.status === 429
            ? "provider_rate_limit"
            : `provider_http_${response.status}`,
        retryable: response.status === 429,
        retryAfter,
      };
    } catch {
      return {
        kind: "unknown",
        code: "provider_connection_unknown",
        retryable: true,
        retryAfter: 60,
      };
    }
  };
}
