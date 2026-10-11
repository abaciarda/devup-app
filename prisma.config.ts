import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const cliUrl = new URL(env("DATABASE_URL"));

if (cliUrl.hostname === "pooled.db.prisma.io") {
  cliUrl.hostname = "db.prisma.io";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: cliUrl.toString(),
  },
});
