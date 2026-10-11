import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the development database.");
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

const sourceKeys = ["hackernews", "devto", "lobsters"] as const;

async function main(): Promise<void> {
  for (const key of sourceKeys) {
    await db.source.upsert({
      where: { key },
      update: {},
      create: { key, enabled: true, config: {} },
    });
  }

  const count = await db.source.count();
  console.log(`Seed complete. Source rows: ${count}`);
}

main()
  .catch(() => {
    console.error(
      "Seed failed. Check the connection and schema push status; credentials are not printed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
