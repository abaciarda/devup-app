import "server-only";
import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value) => /^postgres(?:ql)?:\/\//.test(value),
      "DATABASE_URL must be a PostgreSQL connection URL",
    ),
});

type DatabaseEnvironment = z.infer<typeof databaseSchema>;

let cached: DatabaseEnvironment | undefined;

export function databaseEnv(): DatabaseEnvironment {
  if (cached) return cached;

  const result = databaseSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
  });

  if (!result.success) {
    throw new Error("DATABASE_URL is missing or is not a valid PostgreSQL URL");
  }

  cached = result.data;
  return cached;
}
