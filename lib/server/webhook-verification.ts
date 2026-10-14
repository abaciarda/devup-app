import "server-only";
import { Webhook } from "svix";

export async function readWebhookBody(
  request: Request,
): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > 65536 || !request.body)
    return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 5000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) return null;
      chunks.push(value);
    }
    return timedOut ? null : Buffer.concat(chunks).toString("utf8");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function verifyEmailWebhook(
  raw: string,
  headers: Headers,
  secret: string,
): unknown {
  new Webhook(secret).verify(raw, {
    "svix-id": headers.get("svix-id") ?? "",
    "svix-timestamp": headers.get("svix-timestamp") ?? "",
    "svix-signature": headers.get("svix-signature") ?? "",
  });
  return JSON.parse(raw);
}
