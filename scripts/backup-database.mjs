import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  databaseIdentity,
  postgresEnvironment,
  postgresTool,
  runTool,
} from "./database-tools.mjs";

async function main() {
  const sourceIdentity = databaseIdentity(process.env.DATABASE_URL);
  const env = postgresEnvironment(process.env.DATABASE_URL);
  const version = await runTool(postgresTool("pg_dump"), ["--version"]);
  const directory = resolve(".local-backups");
  await mkdir(directory, { recursive: true });
  const name = `devup-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.dump`;
  const path = resolve(directory, name);
  await runTool(
    postgresTool("pg_dump"),
    [
      "--format=custom",
      "--schema=public",
      "--no-owner",
      "--no-privileges",
      "--no-password",
      "--lock-wait-timeout=10s",
      `--file=${path}.partial`,
    ],
    env,
  );
  const archiveList = await runTool(postgresTool("pg_restore"), [
    "--list",
    `${path}.partial`,
  ]);
  if (!archiveList.includes("TABLE DATA"))
    throw new Error("Backup has no application table data entries");
  await runTool(postgresTool("pg_restore"), [
    `--file=${process.platform === "win32" ? "NUL" : "/dev/null"}`,
    "--no-owner",
    "--no-privileges",
    `${path}.partial`,
  ]);
  const sha256 = createHash("sha256")
    .update(await readFile(`${path}.partial`))
    .digest("hex");
  await rename(`${path}.partial`, path);
  const manifest = {
    version: 1,
    file: name,
    createdAt: new Date().toISOString(),
    sourceIdentity,
    sha256,
    scope: "public",
    tool: version.trim(),
    restoreVerified: false,
  };
  await writeFile(`${path}.json`, JSON.stringify(manifest, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    resolve(directory, "latest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  console.log(`Backup saved: .local-backups/${name}`);
  console.log(
    "Archive directory verified. A restore has not been tested. Keep this private backup outside Git.",
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
