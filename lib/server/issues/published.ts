import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ArchiveCursor } from "../../../types/public-issue";
import {
  readArchiveFromDatabase,
  readFeedFromDatabase,
  readHomeFromDatabase,
  readIssueFromDatabase,
  readSitemapFromDatabase,
} from "./queries";

export async function loadHomeIssues() {
  "use cache";
  cacheTag("issues");
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return readHomeFromDatabase();
}

export async function loadPublishedIssue(date: string) {
  "use cache";
  cacheTag("issues");
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return readIssueFromDatabase(date);
}

export async function loadArchivePage(cursor: ArchiveCursor) {
  "use cache";
  cacheTag("issues");
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return readArchiveFromDatabase(cursor);
}

export async function loadSitemapIssues() {
  "use cache";
  cacheTag("issues");
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return readSitemapFromDatabase();
}

export async function loadFeedIssues() {
  "use cache";
  cacheTag("issues");
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  return readFeedFromDatabase();
}
