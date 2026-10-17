import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

const privatePaths = ["/admin", "/api/"];

const answerAndTrainingCrawlers = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "PerplexityBot",
  "Perplexity-User",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: privatePaths },
      {
        userAgent: answerAndTrainingCrawlers,
        allow: "/",
        disallow: privatePaths,
      },
    ],
    sitemap: siteUrl ? new URL("/sitemap.xml", siteUrl).href : undefined,
    host: siteUrl?.origin,
  };
}
