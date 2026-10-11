import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client";
import { parseIssueContent } from "../types/issue-content";
import { makeExampleContent } from "./content-fixture";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to check the editorial models.");
}

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
  }),
});

const rollback = new Error("Rollback Task 02 verification");

async function main(): Promise<void> {
  const source = await db.source.findUniqueOrThrow({
    where: { key: "hackernews" },
  });
  const before = await db.$transaction([db.issue.count(), db.rawItem.count()]);

  let verified = false;

  try {
    await db.$transaction(
      async (tx) => {
        const editionDate = new Date("2099-01-01T00:00:00.000Z");
        const existing = await tx.issue.findUnique({ where: { editionDate } });

        assert.equal(existing, null, "Verification date is already occupied");

        const issue = await tx.issue.create({ data: { editionDate } });
        assert.equal(issue.generationStatus, "draft");
        assert.equal(issue.content, null);
        assert.equal(issue.publishedAt, null);

        const rawItemIds: number[] = [];
        const runId = randomUUID();

        for (let index = 0; index < 5; index += 1) {
          const url = `https://example.com/task-02/story-${index + 1}`;
          const item = await tx.rawItem.create({
            data: {
              sourceId: source.id,
              externalId: `task-02:${runId}:${index}`,
              title: `Example story ${index + 1}`,
              originalUrl: url,
              normalizedUrl: url,
              excerpt:
                "Synthetic source text used only by the verification script.",
              usedIssueId: issue.id,
            },
          });
          rawItemIds.push(item.id);
        }

        const content = makeExampleContent(rawItemIds);

        await tx.issue.update({
          where: { id: issue.id },
          data: { generationStatus: "ready", content },
        });

        const stored = await tx.issue.findUniqueOrThrow({
          where: { id: issue.id },
          include: { rawItems: true },
        });

        assert.deepEqual(parseIssueContent(stored.content), content);
        assert.equal(stored.rawItems.length, 5);
        assert.equal(stored.publishedAt, null);
        assert.equal(stored.deliveryStartedAt, null);
        verified = true;
        throw rollback;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }

  assert.equal(verified, true);

  const after = await db.$transaction([db.issue.count(), db.rawItem.count()]);

  assert.deepEqual(
    after,
    before,
    "Verification must not leave example rows behind",
  );
  console.log(
    "Editorial database checks passed. Example rows were rolled back.",
  );
}

main()
  .catch(() => {
    console.error(
      "Editorial check failed. Check schema push, generated client, seed, and verification date; credentials are not printed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
