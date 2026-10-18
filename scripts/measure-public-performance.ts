import "dotenv/config";
import { performance } from "node:perf_hooks";

const origin = new URL(
  process.env.SITE_URL || "https://devup.ardaabaci.com",
);
if (origin.username || origin.password || origin.search || origin.hash)
  throw new Error("Use a website origin without credentials or query parameters");

for (const path of ["/tr", "/tr/archive"]) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const start = performance.now();
    const response = await fetch(new URL(path, origin), {
      signal: AbortSignal.timeout(30_000),
    });
    const headersMs = Math.round(performance.now() - start);
    await response.arrayBuffer();
    console.log(
      JSON.stringify({
        layer: "http",
        path,
        attempt,
        status: response.status,
        headersMs,
        totalMs: Math.round(performance.now() - start),
        cache: response.headers.get("x-vercel-cache"),
        age: response.headers.get("age"),
      }),
    );
    if (!response.ok) process.exitCode = 1;
  }
}

if (process.argv.includes("--database")) {
  const { getDb } = await import("../lib/server/database/client");
  const { readHomeFromDatabase, readArchiveFromDatabase } = await import(
    "../lib/server/issues/queries"
  );
  const db = getDb();
  try {
    const reads = [
      { name: "home", run: () => readHomeFromDatabase(db) },
      { name: "archive", run: () => readArchiveFromDatabase(null, db) },
    ];
    for (const { name, run } of reads) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const start = performance.now();
        await run();
        console.log(
          JSON.stringify({
            layer: "database",
            name,
            attempt,
            ms: Math.round(performance.now() - start),
          }),
        );
      }
    }
  } finally {
    await db.$disconnect();
  }
}
