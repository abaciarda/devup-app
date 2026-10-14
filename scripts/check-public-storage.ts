import "dotenv/config";
import assert from "node:assert/strict";
import { getDb } from "../lib/server/db";
import { validateModelDraft } from "../lib/server/draft-content";
import {
  readArchiveFromDatabase,
  readHomeFromDatabase,
  readIssueFromDatabase,
  readSitemapFromDatabase,
} from "../lib/server/published-queries";
import {
  acquirePipelineLease,
  releasePipelineLease,
  renewPipelineLease,
} from "../lib/server/pipeline-lease";
import { draftFixture } from "./draft-fixture";

class RollbackCheck extends Error {}

async function main() {
  const db = getDb();
  let lease: Awaited<ReturnType<typeof acquirePipelineLease>> = null;
  try {
    lease = await acquirePipelineLease();
    assert.ok(lease, "Stop other pipeline tasks before this check");
    const count = await db.issue.count();
    const owner = lease;
    try {
      await db.$transaction(
        async (tx) => {
          assert.ok(await renewPipelineLease(owner, 600, tx));
          const fixture = draftFixture();
          const draft = validateModelDraft(fixture.output, fixture.pool);
          assert.ok(draft);
          await tx.issue.createMany({
            data: Array.from({ length: 12 }, (_, index) => {
              const key = `2099-08-${String(index + 1).padStart(2, "0")}`;
              const content = structuredClone(draft.content);
              content.en.title = `Public fixture ${key}`;
              content.tr.title = `Yayımlanan örnek ${key}`;
              return {
                editionDate: new Date(`${key}T00:00:00.000Z`),
                generationStatus: "ready" as const,
                content,
                publishedAt: new Date(`${key}T09:00:00.000Z`),
                generationError: "private diagnostic canary",
              };
            }),
          });
          const privateContent = structuredClone(draft.content);
          privateContent.en.title = "Unpublished title canary";
          await tx.issue.create({
            data: {
              editionDate: new Date("2099-08-13T00:00:00.000Z"),
              generationStatus: "ready",
              content: privateContent,
            },
          });
          const home = await readHomeFromDatabase(tx);
          assert.equal(home.latest?.date, "2099-08-12");
          assert.equal(home.previous.length, 6);
          assert.ok(
            !JSON.stringify(home).includes("private diagnostic canary"),
          );
          assert.ok(!JSON.stringify(home).includes("Unpublished title canary"));
          assert.equal(await readIssueFromDatabase("2099-08-13", tx), null);
          assert.equal(await readIssueFromDatabase("2099-02-30", tx), null);
          const first = await readArchiveFromDatabase(null, tx);
          assert.equal(first.issues.length, 10);
          assert.equal(first.issues[0].date, "2099-08-12");
          assert.equal(first.older, "2099-08-03");
          assert.equal(first.newer, null);
          const second = await readArchiveFromDatabase(
            { direction: "before", date: first.older },
            tx,
          );
          assert.deepEqual(
            second.issues
              .filter((issue) => issue.date.startsWith("2099-08-"))
              .map((issue) => issue.date),
            ["2099-08-02", "2099-08-01"],
          );
          assert.equal(second.newer, "2099-08-02");
          const back = await readArchiveFromDatabase(
            { direction: "after", date: second.newer },
            tx,
          );
          assert.deepEqual(
            back.issues.map((issue) => issue.date),
            first.issues.map((issue) => issue.date),
          );
          const sitemap = await readSitemapFromDatabase(tx);
          assert.equal(
            sitemap.filter((issue) => issue.date.startsWith("2099-08-")).length,
            12,
          );
          assert.ok(!sitemap.some((issue) => issue.date === "2099-08-13"));
          throw new RollbackCheck();
        },
        { maxWait: 5000, timeout: 20_000 },
      );
    } catch (error) {
      if (!(error instanceof RollbackCheck)) throw error;
    }
    assert.equal(await db.issue.count(), count);
    console.log(
      "Public database checks passed; synthetic publication rows were rolled back",
    );
  } finally {
    if (lease) await releasePipelineLease(lease);
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Public database check failed. Check access and the reserved August 2099 fixture dates.",
  );
  process.exitCode = 1;
});
