import { sourceKeys } from "../lib/server/candidates";
import { fetchSource } from "../lib/server/sources/adapters";
import { sourceErrorCode } from "../lib/server/sources/http";
import { hasUsefulSourceText } from "../lib/server/sources/text";

const results = await Promise.all(
  sourceKeys.map(async (sourceKey) => {
    try {
      const batch = await fetchSource(sourceKey, 3, {
        now: new Date(),
        signal: AbortSignal.timeout(45_000),
      });
      return {
        sourceKey,
        status: batch.errors.length ? "partial" : "ok",
        listed: batch.listed,
        received: batch.items.length,
        usefulText: batch.items.filter((item) =>
          hasUsefulSourceText(item.excerpt),
        ).length,
        rejected: batch.rejected,
        errors: batch.errors,
      };
    } catch (error) {
      return { sourceKey, status: "failed", errors: [sourceErrorCode(error)] };
    }
  }),
);

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => result.status !== "ok")) process.exitCode = 1;
