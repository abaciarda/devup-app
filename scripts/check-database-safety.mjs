import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  databaseIdentity,
  postgresEnvironment,
  verifyRestoreTarget,
} from "./database-tools.mjs";
import { verifyRecentBackup } from "./prisma-safe.mjs";

const source =
  "postgresql://fixture:private@pooled.db.prisma.io:5432/postgres?sslmode=require";
assert.equal(
  databaseIdentity(source),
  databaseIdentity(source.replace("pooled.db", "db")),
);
assert.equal(
  databaseIdentity(source),
  databaseIdentity(source.replace("private@", "rotated@")),
);
assert.notEqual(
  databaseIdentity(source),
  databaseIdentity(source.replace("fixture:", "another-database:")),
);
assert.equal(postgresEnvironment(source).PGHOST, "db.prisma.io");
assert.equal(postgresEnvironment(source).PGSSLMODE, "verify-full");
assert.equal(postgresEnvironment(source).PGPASSWORD, "private");
assert.throws(() => databaseIdentity("sqlite://local"));
assert.throws(() => verifyRestoreTarget(databaseIdentity(source), source, 0));
assert.throws(() =>
  verifyRestoreTarget(
    databaseIdentity(source),
    source.replace("fixture:", "other:"),
    1,
  ),
);
assert.doesNotThrow(() =>
  verifyRestoreTarget(
    databaseIdentity(source),
    source.replace("fixture:", "other:"),
    0,
  ),
);
const directory = await mkdtemp(join(tmpdir(), "devup-backup-check-"));
const archive = Buffer.from("test archive for backup guard only");
const now = Date.parse("2026-10-16T18:00:00Z");
const manifest = {
  version: 1,
  scope: "public",
  sourceIdentity: databaseIdentity(source),
  file: "fixture.dump",
  createdAt: new Date(now).toISOString(),
  sha256: createHash("sha256").update(archive).digest("hex"),
};
try {
  await writeFile(join(directory, "fixture.dump"), archive);
  await writeFile(join(directory, "latest.json"), JSON.stringify(manifest));
  await verifyRecentBackup(source, directory, now);
  await assert.rejects(verifyRecentBackup(source, directory, now + 86400_001));
  await assert.rejects(verifyRecentBackup(source, directory, now - 1));
  await assert.rejects(
    verifyRecentBackup(
      source.replace("fixture:", "different:"),
      directory,
      now,
    ),
  );
  await writeFile(join(directory, "fixture.dump"), "modified");
  await assert.rejects(verifyRecentBackup(source, directory, now));
  await writeFile(
    join(directory, "latest.json"),
    JSON.stringify({ ...manifest, file: "../fixture.dump" }),
  );
  await assert.rejects(verifyRecentBackup(source, directory, now));
  console.log(
    "Backup guard passed: identity matching, pooled/direct normalization, freshness, future timestamps, checksum mismatch, and unsafe paths",
  );
} finally {
  await unlink(join(directory, "fixture.dump"));
  await unlink(join(directory, "latest.json"));
  await rmdir(directory);
}
