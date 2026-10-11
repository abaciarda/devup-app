import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required to check the development database.",
  );
}

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
  }),
});

async function main(): Promise<void> {
  const sources = await db.source.findMany({
    orderBy: { key: "asc" },
    select: { key: true, enabled: true },
  });

  const expectedKeys = ["hackernews", "devto", "lobsters"];
  const actualKeys = new Set(sources.map((source) => source.key));
  const missing = expectedKeys.filter((key) => !actualKeys.has(key));

  if (missing.length > 0) {
    throw new Error(`Missing source rows: ${missing.join(", ")}`);
  }

  console.log("Database connection OK. All three initial source keys exist.");
  console.table(sources);
}

main()
  .catch(() => {
    console.error(
      "Database check failed. Verify .env, schema push, and seed; credentials are not printed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
