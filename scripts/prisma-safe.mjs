import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { databaseIdentity, runTool } from "./database-tools.mjs";

export async function verifyRecentBackup(
  url,
  directory = resolve(".local-backups"),
  now = Date.now(),
) {
  const manifest = JSON.parse(
    await readFile(resolve(directory, "latest.json"), "utf8"),
  );
  if (
    manifest.version !== 1 ||
    manifest.scope !== "public" ||
    manifest.sourceIdentity !== databaseIdentity(url) ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    now - Date.parse(manifest.createdAt) > 86400_000 ||
    Date.parse(manifest.createdAt) > now ||
    typeof manifest.file !== "string" ||
    basename(manifest.file) !== manifest.file ||
    !manifest.file.endsWith(".dump")
  )
    throw new Error(
      "A matching database backup less than 24 hours old is required",
    );
  const hash = createHash("sha256")
    .update(await readFile(resolve(directory, manifest.file)))
    .digest("hex");
  if (hash !== manifest.sha256)
    throw new Error("Backup checksum does not match");
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--allow-live-schema-change"))
    throw new Error(
      "This shortcut changes the shared database. Run pnpm db:backup, then repeat with --allow-live-schema-change after reviewing the change",
    );
  await verifyRecentBackup(process.env.DATABASE_URL);
  const require = createRequire(import.meta.url);
  await runTool(process.execPath, [
    require.resolve("prisma/build/index.js"),
    ...args.filter((arg) => arg !== "--allow-live-schema-change"),
  ]);
  console.log("Database command finished");
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  main().catch(() => {
    console.error(
      "Live database change blocked or failed. A verified recent backup and --allow-live-schema-change are required; also check the installed Prisma CLI.",
    );
    process.exitCode = 1;
  });
