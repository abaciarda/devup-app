import { siteUrl } from "@/lib/site";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: siteUrl ? new URL("/sitemap.xml", siteUrl).href : undefined,
  };
}
