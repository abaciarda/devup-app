import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";
import { siteLanguages } from "../../localized-routes";

export function refreshPublishedIssueCache(editionKey: string): void {
  revalidateTag("issues", { expire: 0 });
  revalidatePath("/[lang]", "layout");
  for (const language of siteLanguages) {
    revalidatePath(`/${language}`);
    revalidatePath(`/${language}/archive`);
    revalidatePath(`/${language}/digest/${editionKey}`);
    revalidatePath(`/${language}/rss.xml`);
  }
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
}
