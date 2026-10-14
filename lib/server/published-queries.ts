import "server-only";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { editionDateFromKey } from "../edition-date";
import { parsePublicIssue, summarizeIssue } from "../public-issues";
import type { ArchiveCursor, ArchivePage } from "../../types/public-issue";
import { getDb } from "./db";

type Reader = Pick<Prisma.TransactionClient, "issue">;
const publicSelect = {
  id: true,
  editionDate: true,
  publishedAt: true,
  content: true,
} as const;
const cursorSchema = z
  .strictObject({ direction: z.enum(["before", "after"]), date: z.string() })
  .nullable();
const pageSize = 10;

export async function readHomeFromDatabase(client: Reader = getDb()) {
  const rows = await client.issue.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { editionDate: "desc" },
    take: 7,
    select: publicSelect,
  });
  const issues = rows.map(parsePublicIssue);
  return {
    latest: issues[0] ?? null,
    previous: issues.slice(1).map(summarizeIssue),
  };
}

export async function readIssueFromDatabase(
  date: string,
  client: Reader = getDb(),
) {
  let editionDate: Date;
  try {
    editionDate = editionDateFromKey(date);
  } catch {
    return null;
  }
  const row = await client.issue.findFirst({
    where: { editionDate, publishedAt: { not: null } },
    select: publicSelect,
  });
  return row ? parsePublicIssue(row) : null;
}

export async function readArchiveFromDatabase(
  input: ArchiveCursor,
  client: Reader = getDb(),
): Promise<ArchivePage> {
  const cursor = cursorSchema.parse(input);
  const date = cursor ? editionDateFromKey(cursor.date) : null;
  const rows = await client.issue.findMany({
    where: {
      publishedAt: { not: null },
      ...(date && cursor
        ? {
            editionDate:
              cursor.direction === "before" ? { lt: date } : { gt: date },
          }
        : {}),
    },
    orderBy: { editionDate: cursor?.direction === "after" ? "asc" : "desc" },
    take: pageSize,
    select: publicSelect,
  });
  if (cursor?.direction === "after") rows.reverse();
  const issues = rows.map(parsePublicIssue).map(summarizeIssue);
  if (issues.length === 0) return { issues, older: null, newer: null };
  const first = issues[0].date;
  const last = issues[issues.length - 1].date;
  const [older, newer] = await Promise.all([
    client.issue.findFirst({
      where: {
        publishedAt: { not: null },
        editionDate: { lt: editionDateFromKey(last) },
      },
      select: { id: true },
    }),
    client.issue.findFirst({
      where: {
        publishedAt: { not: null },
        editionDate: { gt: editionDateFromKey(first) },
      },
      select: { id: true },
    }),
  ]);
  return { issues, older: older ? last : null, newer: newer ? first : null };
}

export async function readSitemapFromDatabase(client: Reader = getDb()) {
  const rows = await client.issue.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { editionDate: "desc" },
    take: 1000,
    select: { editionDate: true, publishedAt: true },
  });
  return rows.map((row) => {
    const valid = z
      .strictObject({ editionDate: z.date(), publishedAt: z.date() })
      .parse(row);
    return {
      date: valid.editionDate.toISOString().slice(0, 10),
      publishedAt: valid.publishedAt.toISOString(),
    };
  });
}
