import "server-only";
import type { Prisma } from "../../../generated/prisma/client";
import { getDb } from "../database/client";

export async function providerCooldown() {
  const row = await getDb().rateLimit.findUnique({
    where: { key: "email:provider-cooldown" },
    select: { expiresAt: true },
  });
  return row && row.expiresAt > new Date() ? row.expiresAt : null;
}
export async function saveProviderCooldown(
  tx: Prisma.TransactionClient,
  seconds: number,
) {
  const now = new Date();
  const until = new Date(
    now.getTime() + Math.min(86400, Math.max(60, seconds)) * 1000,
  );
  const current = await tx.rateLimit.findUnique({
    where: { key: "email:provider-cooldown" },
  });
  await tx.rateLimit.upsert({
    where: { key: "email:provider-cooldown" },
    create: {
      key: "email:provider-cooldown",
      hits: 1,
      windowStartedAt: now,
      expiresAt: until,
    },
    update: {
      expiresAt:
        current && current.expiresAt > until ? current.expiresAt : until,
    },
  });
}
