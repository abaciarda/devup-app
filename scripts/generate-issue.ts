import "dotenv/config";
import { getDb } from "../lib/server/db";
import { generateIssue } from "../lib/server/generate-issue";
import { PipelineLeaseLostError } from "../lib/server/pipeline-lease";

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
