import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import {
  postgresEnvironment,
  postgresTool,
  runTool,
  verifyRestoreTarget,
} from "./database-tools.mjs";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => arg.endsWith(".dump"));
  if (
    !file ||
    !args.includes("--into-empty-database") ||
    !process.env.RESTORE_DATABASE_URL
  )
    throw new Error(
      "Provide a backup .dump file, RESTORE_DATABASE_URL, and --into-empty-database. Live database restoration is not supported by this shortcut",
    );
  const path = resolve(file);
  const manifest = JSON.parse(await readFile(`${path}.json`, "utf8"));
  if (manifest.version !== 1 || manifest.scope !== "public")
    throw new Error("Unsupported backup manifest");
  const sha256 = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (manifest.sha256 !== sha256)
    throw new Error("Backup checksum does not match");
  verifyRestoreTarget(
    manifest.sourceIdentity,
    process.env.RESTORE_DATABASE_URL,
    0,
  );
  const target = new URL(process.env.RESTORE_DATABASE_URL);
  if (target.hostname === "pooled.db.prisma.io")
    target.hostname = "db.prisma.io";
  const pool = new Pool({
    connectionString: target.toString(),
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  try {
    const result = await pool.query(
      "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname <> 'information_schema' AND n.nspname !~ '^pg_' AND c.relkind IN ('r','p','v','m','S','f')",
    );
    verifyRestoreTarget(
      manifest.sourceIdentity,
      process.env.RESTORE_DATABASE_URL,
      result.rows[0].count,
    );
    const env = postgresEnvironment(process.env.RESTORE_DATABASE_URL);
    await runTool(
      postgresTool("pg_restore"),
      [
        `--dbname=${env.PGDATABASE}`,
        "--single-transaction",
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "--no-password",
        path,
      ],
      env,
    );
    console.log(
      "Archive restored into the separate empty target. Verify schema, record counts and application behavior before considering a production recovery",
    );
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    "Restore blocked or failed. Check the backup checksum, a separate empty target, and PostgreSQL client tools. Credentials and database contents were not logged",
  );
  process.exitCode = 1;
});
