import type { IssueContent } from "./issue-content";
import type { Language } from "./digest";

export type PublicIssue = {
  id: number;
  editionNumber: number;
  date: string;
  publishedAt: string;
  content: IssueContent;
};

export type IssueSummary = {
  id: number;
  editionNumber: number;
  date: string;
  titles: Record<Language, string>;
  storyCount: number;
};

export type ArchiveCursor = {
  direction: "before" | "after";
  date: string;
} | null;

export type ArchivePage = {
  issues: IssueSummary[];
  older: string | null;
  newer: string | null;
};
