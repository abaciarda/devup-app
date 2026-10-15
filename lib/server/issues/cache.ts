import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

export function refreshPublishedIssueCache(editionKey: string): void {
  revalidateTag("issues", { expire: 0 });
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath(`/digest/${editionKey}`);
  revalidatePath("/sitemap.xml");
}
