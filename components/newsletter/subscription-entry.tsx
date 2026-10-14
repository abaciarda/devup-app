import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { subscriptionEnv } from "@/lib/server/subscription-env";
import {
  createSubscriptionProof,
  verifySubscriberLink,
  type SubscriptionAction,
} from "@/lib/server/subscriber-links";
import { hashToken } from "@/lib/server/security";
import SubscriptionActionView from "./subscription-action";

type Props = {
  action: SubscriptionAction;
  searchParams: Promise<{ token?: string | string[] }>;
};
async function Entry({ action, searchParams }: Props) {
  await connection();
  const value = (await searchParams).token;
  if (typeof value !== "string" || value.length < 20 || value.length > 1024)
    return <SubscriptionActionView valid={false} />;
  const env = subscriptionEnv();
  const db = getDb();
  const link =
    action === "confirm" ? null : verifySubscriberLink(value, action, env);
  const subscriber =
    action === "confirm" && /^[A-Za-z0-9_-]{43}$/.test(value)
      ? await db.subscriber.findFirst({
          where: {
            status: "pending",
            confirmationTokenHash: hashToken(value),
            confirmationExpiresAt: { gt: new Date() },
          },
          select: { language: true },
        })
      : link
        ? await db.subscriber.findFirst({
            where: {
              id: link.id,
              subscriptionVersion: link.subscriptionVersion,
              status:
                action === "preferences"
                  ? "confirmed"
                  : { in: ["confirmed", "pending"] },
            },
            select: { language: true },
          })
        : null;
  return (
    <SubscriptionActionView
      valid={Boolean(subscriber)}
      action={action}
      token={value}
      proof={
        subscriber ? createSubscriptionProof(value, action, env) : undefined
      }
      language={subscriber?.language}
    />
  );
}
export default function SubscriptionEntry(props: Props) {
  return (
    <Suspense fallback={<p className="px-6 py-12">Loading…</p>}>
      <Entry {...props} />
    </Suspense>
  );
}
