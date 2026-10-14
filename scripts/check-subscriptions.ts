import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { subscriptionEnvSchema } from "../lib/server/subscription-env";
import {
  createSubscriberLink,
  verifySubscriberLink,
  createSubscriptionProof,
  verifySubscriptionProof,
} from "../lib/server/subscriber-links";
import {
  authorizeSubscriptionForm,
  readSubscriptionForm,
  subscriptionResponse,
} from "../lib/server/subscription-http";
import { signupSchema } from "../lib/server/subscriptions";

async function main() {
  const env = subscriptionEnvSchema.parse({
    SITE_URL: "https://devup.example",
    SUBSCRIBER_LINK_SECRET: randomBytes(32).toString("base64url"),
    CONSENT_VERSION: "fixture",
  });
  const subscriber = { id: randomUUID(), subscriptionVersion: 1 };
  const now = Date.now();
  const unsubscribe = createSubscriberLink("unsubscribe", subscriber, env, now);
  const preferences = createSubscriberLink("preferences", subscriber, env, now);
  assert.equal(
    verifySubscriberLink(unsubscribe, "unsubscribe", env, now + 366 * 86400_000)
      ?.id,
    subscriber.id,
  );
  assert.equal(
    verifySubscriberLink(preferences, "preferences", env, now + 30 * 86400_000),
    null,
  );
  assert.equal(verifySubscriberLink(unsubscribe, "preferences", env), null);
  assert.equal(
    verifySubscriberLink(`x${unsubscribe}`, "unsubscribe", env),
    null,
  );
  const rotated = {
    ...env,
    SUBSCRIBER_LINK_SECRET: randomBytes(32).toString("base64url"),
    SUBSCRIBER_LINK_SECRET_PREVIOUS: env.SUBSCRIBER_LINK_SECRET,
  };
  assert.ok(verifySubscriberLink(unsubscribe, "unsubscribe", rotated));
  assert.equal(
    verifySubscriberLink(unsubscribe, "unsubscribe", {
      ...rotated,
      SUBSCRIBER_LINK_SECRET_PREVIOUS: undefined,
    }),
    null,
  );
  const proof = createSubscriptionProof(unsubscribe, "unsubscribe", env, now);
  assert.ok(
    verifySubscriptionProof(proof, unsubscribe, "unsubscribe", env, now),
  );
  assert.equal(
    verifySubscriptionProof(
      proof,
      unsubscribe,
      "unsubscribe",
      env,
      now + 900_000,
    ),
    false,
  );
  assert.equal(
    verifySubscriptionProof(proof, preferences, "unsubscribe", env, now),
    false,
  );
  assert.equal(
    verifySubscriptionProof(proof, unsubscribe, "confirm", env, now),
    false,
  );
  for (const origin of ["https://devup.example", "null", ""]) {
    assert.ok(
      authorizeSubscriptionForm(
        new Request(env.SITE_URL, { headers: origin ? { origin } : {} }),
        unsubscribe,
        proof,
        "unsubscribe",
        env,
      ),
    );
  }
  assert.equal(
    authorizeSubscriptionForm(
      new Request(env.SITE_URL, {
        headers: { origin: "https://other.example" },
      }),
      unsubscribe,
      proof,
      "unsubscribe",
      env,
    ),
    false,
  );
  const request = (body: string) =>
    new Request(env.SITE_URL, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  assert.deepEqual(
    await readSubscriptionForm(request("List-Unsubscribe=One-Click")),
    { "List-Unsubscribe": "One-Click" },
  );
  assert.equal(await readSubscriptionForm(request("token=a&token=b")), null);
  assert.equal(
    await readSubscriptionForm(request(`token=${"a".repeat(8192)}`)),
    null,
  );
  const form = new FormData();
  form.set("List-Unsubscribe", "One-Click");
  assert.deepEqual(
    await readSubscriptionForm(
      new Request(env.SITE_URL, { method: "POST", body: form }),
      true,
    ),
    { "List-Unsubscribe": "One-Click" },
  );
  assert.equal(
    signupSchema.parse({
      email: " Reader@Example.com ",
      language: "en",
      consent: "yes",
    }).email,
    "reader@example.com",
  );
  assert.equal(
    signupSchema.safeParse({ email: "reader@example.com", language: "en" })
      .success,
    false,
  );
  assert.equal(
    subscriptionResponse(new Response()).headers.get("Referrer-Policy"),
    "no-referrer",
  );
  console.log(
    "Subscription signatures, rotation, expiry, purpose binding, form proof, bounded bodies, consent and privacy headers passed",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
