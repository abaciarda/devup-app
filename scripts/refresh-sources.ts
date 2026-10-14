import "dotenv/config";
import { getDb } from "../lib/server/database/client";
import { refreshSources } from "../lib/server/sources/refresh";

refreshSources()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (
      result.status === "complete" &&
      result.sources.some((source) =>
        ["failed", "partial"].includes(source.status),
      )
    ) {
      process.exitCode = 1;
    }
  })
  .catch(() => {
    console.error(
      "Source refresh failed. Check database connectivity, Task 03, and provider availability; credentials are not printed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDb().$disconnect();
  });
