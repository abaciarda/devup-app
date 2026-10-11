import "server-only";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { getDb } from "./db";

export type SqlClient = Pick<Prisma.TransactionClient, "$queryRaw">;

const optionsSchema = z.strictObject({
  key: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(10_000),
  windowSeconds: z.number().int().min(1).max(86_400),
});

const rowsSchema = z
  .array(
    z.strictObject({
      hits: z.number().int().positive(),
      expiresAt: z.date(),
      retryAfterSeconds: z.number().int().nonnegative(),
    }),
  )
  .length(1);

export type RateLimitOptions = z.infer<typeof optionsSchema>;

export type RateLimitResult = {
  allowed: boolean;
  hits: number;
  expiresAt: Date;
  retryAfterSeconds: number;
};

export async function consumeRateLimit(
  options: RateLimitOptions,
  client: SqlClient = getDb(),
): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = optionsSchema.parse(options);

  const result = await client.$queryRaw`
        INSERT INTO "RateLimit" ("key", "hits", "windowStartedAt", "expiresAt")
        VALUES (
            ${key},
            1,
            statement_timestamp(),
            statement_timestamp() + ${windowSeconds}::integer * interval '1 second'
        )
        ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE
        WHEN "RateLimit"."expiresAt" <= EXCLUDED."windowStartedAt" THEN 1
        ELSE LEAST("RateLimit"."hits" + 1, ${limit}::integer + 1)
      END,
      "windowStartedAt" = CASE
        WHEN "RateLimit"."expiresAt" <= EXCLUDED."windowStartedAt"
          THEN EXCLUDED."windowStartedAt"
        ELSE "RateLimit"."windowStartedAt"
      END,
      "expiresAt" = CASE
        WHEN "RateLimit"."expiresAt" <= EXCLUDED."windowStartedAt"
          THEN EXCLUDED."expiresAt"
        ELSE "RateLimit"."expiresAt"
      END
    RETURNING
      "hits",
      "expiresAt",
      CEIL(GREATEST(0, EXTRACT(EPOCH FROM
        "expiresAt" - statement_timestamp()
      )))::integer AS "retryAfterSeconds"
    `;

  const [row] = rowsSchema.parse(result);

  return {
    allowed: row.hits <= limit,
    hits: row.hits,
    expiresAt: row.expiresAt,
    retryAfterSeconds: row.hits <= limit ? 0 : row.retryAfterSeconds,
  };
}
