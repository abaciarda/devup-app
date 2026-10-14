import "dotenv/config";
import { getDb } from "../lib/server/database/client";
import { generateIssue } from "../lib/server/issues/generate";
import { PipelineLeaseLostError } from "../lib/server/operations/lease";

async function main() {
  try {
    const result = await generateIssue();
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "failed") process.exitCode = 1;
  } catch (error) {
    console.error(
      error instanceof PipelineLeaseLostError
        ? "Pipeline ownership was lost; this result was discarded."
        : "Draft generation failed; check development database access and Gemini settings.",
    );
    process.exitCode = 1;
  } finally {
    await getDb().$disconnect();
  }
}

main();
