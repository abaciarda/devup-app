import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export function databaseIdentity(value) {
  const url = new URL(value);
  if (!/^postgres(?:ql)?:$/.test(url.protocol))
    throw new Error("A PostgreSQL DATABASE_URL is required");
  if (url.hostname === "pooled.db.prisma.io") url.hostname = "db.prisma.io";
  return createHash("sha256")
    .update(
      JSON.stringify([
        url.hostname,
        url.port || "5432",
        url.username,
        url.pathname,
      ]),
    )
    .digest("hex");
}

export function postgresEnvironment(value) {
  databaseIdentity(value);
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const env = {
    ...process.env,
    PGHOST:
      url.hostname === "pooled.db.prisma.io" ? "db.prisma.io" : url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)) || "postgres",
    PGSSLMODE: local ? "prefer" : "verify-full",
    ...(process.env.PGSSLROOTCERT
      ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT }
      : existsSync(resolve(".local-tools/cacert.pem"))
        ? { PGSSLROOTCERT: resolve(".local-tools/cacert.pem") }
        : {}),
    PGCONNECT_TIMEOUT: "10",
    PGOPTIONS: "",
  };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  return env;
}

export function postgresTool(name) {
  const directory =
    process.env.PG_BIN_DIRECTORY ||
    (process.platform === "win32"
      ? resolve(".local-tools/postgresql/pgsql/bin")
      : "");
  const executable = `${name}${process.platform === "win32" ? ".exe" : ""}`;
  return directory ? resolve(directory, executable) : executable;
}

export function verifyRestoreTarget(sourceIdentity, targetUrl, objectCount) {
  if (databaseIdentity(targetUrl) === sourceIdentity)
    throw new Error("Restore target must differ from the backup source");
  if (objectCount !== 0)
    throw new Error("Restore target must contain no existing user relations");
}

export async function runTool(executable, args, env = process.env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-1_000_000);
    });
    child.stderr.on("data", () => {});
    child.on("error", () =>
      reject(
        new Error(
          "Database tool could not start; check the PostgreSQL client installation",
        ),
      ),
    );
    child.on("exit", (code) =>
      code === 0
        ? resolveResult(stdout)
        : reject(
            new Error(
              "Database tool failed; no credentials or database contents were logged",
            ),
          ),
    );
  });
}
