import "server-only";
import { requireAdmin } from "./admin-auth";
import { getDb } from "./db";

export async function readAdminDelivery() {
  await requireAdmin();
  const db = getDb();
  const [
    subscribers,
    sends,
    confirmations,
    unresolved,
    confirmationReview,
    events,
  ] = await Promise.all([
    db.subscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    db.sendLog.groupBy({ by: ["status"], _count: { _all: true } }),
    db.subscriber.groupBy({
      by: ["confirmationStatus"],
      _count: { _all: true },
      where: { confirmationStatus: { not: null } },
    }),
    db.sendLog.findMany({
      where: {
        OR: [
          { needsReview: true },
          { status: "unknown" },
          {
            status: "failed",
            NOT: { payload: { equals: { version: 1, redacted: true } } },
          },
        ],
      },
      orderBy: [{ needsReview: "desc" }, { updatedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        issueId: true,
        status: true,
        attempts: true,
        needsReview: true,
        retryable: true,
        nextAttemptAt: true,
        lastError: true,
        providerId: true,
      },
    }),
    db.subscriber.findMany({
      where: {
        OR: [
          { confirmationNeedsReview: true },
          { confirmationStatus: "unknown" },
          { confirmationStatus: "failed" },
        ],
      },
      orderBy: [{ confirmationNeedsReview: "desc" }, { updatedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        confirmationStatus: true,
        confirmationAttempts: true,
        confirmationNeedsReview: true,
        confirmationRetryable: true,
        confirmationNextAttemptAt: true,
        confirmationError: true,
        confirmationProviderId: true,
      },
    }),
    Promise.all([
      db.sendLog.count({ where: { deliveredAt: { not: null } } }),
      db.confirmationSend.count({ where: { deliveredAt: { not: null } } }),
      db.sendLog.count({ where: { bouncedAt: { not: null } } }),
      db.confirmationSend.count({ where: { bouncedAt: { not: null } } }),
      db.sendLog.count({ where: { complainedAt: { not: null } } }),
      db.confirmationSend.count({ where: { complainedAt: { not: null } } }),
    ]),
  ]);
  return {
    subscribers,
    sends,
    confirmations,
    unresolved,
    confirmationReview,
    events: {
      delivered: events[0] + events[1],
      bounced: events[2] + events[3],
      complained: events[4] + events[5],
    },
  };
}
