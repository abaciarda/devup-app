import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "server-only";
import { databaseEnv } from "./database-env";

function createDatabaseClient(): PrismaClient {
  const configuredUrl = databaseEnv().DATABASE_URL;
  const url = new URL(configuredUrl);
  const schema = url.searchParams.get("schema") ?? "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema))
    throw new Error("Invalid database schema");
  if (schema !== "public")
    url.searchParams.set(
      "options",
      `${url.searchParams.get("options") ?? ""} -c search_path=${schema}`.trim(),
    );
  const connectionString = schema === "public" ? configuredUrl : url.toString();
  const adapter = new PrismaPg(
    {
      connectionString,
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
    },
    { schema },
  );

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
