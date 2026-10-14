import "server-only";
import type { Prisma } from "../../../generated/prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "../database/client";
import type { SqlClient } from "../shared/rate-limit";

const durationSchema = z.number().int().min(60).max(900);

const leaseRowsSchema = z
  .array(
    z.strictObject({
      ownerToken: z.uuid(),
      expiresAt: z.date(),
    }),
  )
  .max(1);

export type PipelineLease = Readonly<{ ownerToken: string; expiresAt: Date }>;

export class PipelineLeaseLostError extends Error {
  constructor() {
    super("Pipeline ownership was lost; discard this worker's result");
    this.name = "PipelineLeaseLostError";
  }
}

export async function acquirePipelineLease(
  seconds = 600,
  client: SqlClient = getDb(),
): Promise<PipelineLease | null> {
  const duration = durationSchema.parse(seconds);
  const ownerToken = randomUUID();

  const result = await client.$queryRaw`
        INSERT INTO "PipelineLease" ("key", "ownerToken", "expiresAt")
        VALUES (
        'pipeline',
        ${ownerToken},
        clock_timestamp() + ${duration}::integer * interval '1 second'
        )
        ON CONFLICT ("key") DO UPDATE SET
        "ownerToken" = EXCLUDED."ownerToken",
        "expiresAt" = EXCLUDED."expiresAt"
        WHERE "PipelineLease"."expiresAt" <= clock_timestamp()
        RETURNING "ownerToken", "expiresAt"
    `;

  return leaseRowsSchema.parse(result)[0] ?? null;
}

export async function renewPipelineLease(
  lease: PipelineLease,
  seconds = 600,
  client: SqlClient = getDb(),
): Promise<PipelineLease | null> {
  const duration = durationSchema.parse(seconds);

  const result = await client.$queryRaw`
    UPDATE "PipelineLease"
    SET "expiresAt" = clock_timestamp() + ${duration}::integer * interval '1 second'
    WHERE "key" = 'pipeline'
      AND "ownerToken" = ${lease.ownerToken}
      AND "expiresAt" > clock_timestamp()
    RETURNING "ownerToken", "expiresAt"
  `;

  return leaseRowsSchema.parse(result)[0] ?? null;
}

export async function releasePipelineLease(
  lease: PipelineLease,
  client: SqlClient = getDb(),
): Promise<boolean> {
  const result = await client.$queryRaw`
        DELETE FROM "PipelineLease"
        WHERE "key" = 'pipeline' AND "ownerToken" = ${lease.ownerToken}
        RETURNING "ownerToken", "expiresAt"
    `;

  return leaseRowsSchema.parse(result).length === 1;
}

export async function commitUnderPipelineLease<T>(
  lease: PipelineLease,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return getDb().$transaction(
    async (tx) => {
      const current = await renewPipelineLease(lease, 600, tx);
      if (!current) throw new PipelineLeaseLostError();
      return write(tx);
    },
    { maxWait: 5000, timeout: 10_000 },
  );
}
