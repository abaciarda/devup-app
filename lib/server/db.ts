import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "server-only";
import { databaseEnv } from "./database-env";

function createDatabaseClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseEnv().DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });

  return new PrismaClient({ adapter });
}

const developmentGlobal = globalThis as typeof globalThis & {
  devupDatabase?: PrismaClient;
};

let productionDatabase: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    productionDatabase ??= createDatabaseClient();
    return productionDatabase;
  }

  developmentGlobal.devupDatabase ??= createDatabaseClient();
  return developmentGlobal.devupDatabase;
}
