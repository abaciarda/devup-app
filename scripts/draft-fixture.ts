import type { Candidate } from "../lib/server/candidates";

export function draftFixture(
  now = new Date("2099-04-01T09:00:00.000Z"),
  ids = [1, 2, 3, 4, 5],
) {
  const quote =
    "The release adds a typed configuration interface and improves error messages for developers.";
  const pool: Candidate[] = ids.map((rawItemId, index) => ({
    rawItemId,
    sourceKey: "devto",
    title: `Developer tool update ${index + 1}`,
    sourceText: `${quote} ${"The project explains the implementation, documents compatibility changes, and provides examples for developers to evaluate the release. ".repeat(5)}`,
    originalUrl: `https://dev.to/devup-fixture/tool-${rawItemId}`,
    normalizedUrl: `https://dev.to/devup-fixture/tool-${rawItemId}`,
    publishedAt: now,
    tags: ["typescript"],
    sourceRank: 1 - index / 5,
  }));
  const edition = (language: "tr" | "en") => ({
    title: language === "tr" ? "Teknoloji haberleri" : "Technology news",
    intro:
      language === "tr"
        ? "Geliştiriciler için doğrulanmış teknoloji güncellemeleri."
        : "Technology updates with useful details for developers.",
    news: pool.map((candidate) => ({
      rawItemId: candidate.rawItemId,
      category: "tools" as const,
      title:
        language === "tr"
          ? `Geliştirici aracı ${candidate.rawItemId}`
          : candidate.title,
      summary:
        language === "tr"
          ? "Yeni sürüm, tipli bir yapılandırma arayüzü ekliyor ve geliştiricilere gösterilen hata mesajlarını iyileştiriyor."
          : "The release adds a typed configuration interface and improves the error messages shown to developers.",
      evidenceIndex: 0,
    })),
  });
  const output = {
    status: "ready",
    reason: "",
    featuredRawItemIds: ids.slice(0, 3),
    tr: edition("tr"),
    en: edition("en"),
  };
  const envelope = {
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(output) }] },
      },
    ],
    modelVersion: "fixture-model",
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 200,
      totalTokenCount: 300,
    },
  };
  return { pool, output, envelope };
}
