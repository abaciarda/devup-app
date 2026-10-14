import { randomUUID } from "node:crypto";

if (process.env.DEVUP_DELIVERY_FIXTURE !== "enabled")
  throw new Error("Fixture must be explicitly enabled in a test-only server");
const originalFetch = globalThis.fetch;
const emails = new Map();
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("https://api.resend.com/"))
    return originalFetch(input, init);
  if (new Headers(init?.headers).get("authorization") !== "Bearer re_fixture")
    throw new Error("Fixture rejects real credentials");
  if (url === "https://api.resend.com/emails" && init?.method === "POST") {
    const key = new Headers(init.headers).get("idempotency-key");
    const body = String(init.body);
    const payload = JSON.parse(body);
    if (payload.to[0].startsWith("task11-http-limited-"))
      return Response.json(
        {},
        { status: 429, headers: { "Retry-After": "120" } },
      );
    if (
      !payload.to[0].startsWith("task11-http-") ||
      !payload.to[0].endsWith("@example.com")
    )
      throw new Error("Fixture rejects non-test recipients");
    const existing = emails.get(key);
    if (existing) {
      if (existing.body !== body)
        return Response.json(
          { name: "invalid_idempotent_request" },
          { status: 409 },
        );
      return Response.json({ id: existing.id });
    }
    const email = { id: randomUUID(), body, ...payload, last_event: "sent" };
    emails.set(key, email);
    if (payload.tags[1].value === "issue")
      throw new Error("Fixture lost provider response after acceptance");
    return Response.json({ id: email.id });
  }
  const id = url.split("/").at(-1);
  const email = [...emails.values()].find((row) => row.id === id);
  return email ? Response.json(email) : Response.json({}, { status: 404 });
};
