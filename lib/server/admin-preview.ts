import "server-only";
import { z } from "zod";
import { issueContentSchema } from "../../types/issue-content";
import { requireAdmin } from "./admin-auth";
import { getDb } from "./db";
import { evidenceSchema } from "./draft-content";

const storedEvidenceSchema = z.object({
  savedDraft: z.object({ evidence: evidenceSchema }).nullable(),
});

export async function listAdminIssues() {
  await requireAdmin();
  return getDb().issue.findMany({
    orderBy: { editionDate: "desc" },
    take: 20,
    select: {
      id: true,
      editionDate: true,
      generationStatus: true,
      generationError: true,
      generationModel: true,
      publishedAt: true,
    },
  });
}

export async function readAdminIssue(input: string) {
  await requireAdmin();
  if (!/^[1-9]\d{0,9}$/.test(input)) return null;
  const id = Number(input);
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) return null;
  const issue = await getDb().issue.findUnique({
    where: { id },
    select: {
      id: true,
      editionDate: true,
      generationStatus: true,
      generationError: true,
      generationModel: true,
      content: true,
      generationUsage: true,
      publishedAt: true,
    },
  });
  if (!issue) return null;
  const content = issueContentSchema.safeParse(issue.content);
  const metadata = storedEvidenceSchema.safeParse(issue.generationUsage);
  const evidence = metadata.success
    ? (metadata.data.savedDraft?.evidence ?? [])
    : [];
  return {
    id: issue.id,
    editionDate: issue.editionDate,
    generationStatus: issue.generationStatus,
    generationError: issue.generationError,
    generationModel: issue.generationModel,
    publishedAt: issue.publishedAt,
    content: content.success ? content.data : null,
    invalidContent: issue.content !== null && !content.success,
    evidence,
  };
}
