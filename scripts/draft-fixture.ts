import type { Candidate } from "../lib/server/sources/candidates";

const stories = [
  [
    "PostgreSQL 19 adds asynchronous index builds",
    "PostgreSQL 19 asenkron indeks oluşturmayı ekliyor",
    "software",
  ],
  [
    "Rust compiler fixes a long-standing soundness bug",
    "Rust derleyicisi uzun süredir açık bir güvenlik hatasını düzeltti",
    "security",
  ],
  [
    "Open model matches frontier coding benchmarks",
    "Açık model, öncü kodlama testlerinde rakiplerine yetişti",
    "ai",
  ],
  [
    "Browser vendors agree on a shared extension format",
    "Tarayıcı üreticileri ortak bir eklenti biçiminde uzlaştı",
    "tools",
  ],
  [
    "Maintainers archive a widely used proxy project",
    "Bakımcılar yaygın kullanılan bir proxy projesini arşivledi",
    "open_source",
  ],
  [
    "Cloud provider acquires a database startup",
    "Bulut sağlayıcısı bir veritabanı girişimini satın aldı",
    "industry",
  ],
  [
    "Kernel release improves scheduler latency",
    "Çekirdek sürümü zamanlayıcı gecikmesini iyileştiriyor",
    "software",
  ],
  [
    "Package registry adds signed provenance",
    "Paket deposu imzalı köken bilgisi ekliyor",
    "security",
  ],
  [
    "Inference runtime streams weights from disk",
    "Çıkarım çalışma ortamı ağırlıkları diskten akışla okuyor",
    "ai",
  ],
  [
    "Terminal emulator ships GPU text rendering",
    "Terminal öykünücüsü GPU ile metin çizimini yayımladı",
    "tools",
  ],
] as const;

export function draftFixture(
  now = new Date("2099-04-01T09:00:00.000Z"),
  ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
) {
  const quote =
    "The release adds a typed configuration interface and improves error messages for developers.";
  const pool: Candidate[] = ids.map((rawItemId, index) => ({
    rawItemId,
    sourceKey: "hackernews",
    title: stories[index % stories.length][0],
    sourceText: `${quote} ${"The project explains the implementation, documents compatibility changes, and provides examples for developers to evaluate the release. ".repeat(5)}`,
    originalUrl: `https://news.example.org/devup-fixture/story-${rawItemId}`,
    normalizedUrl: `https://news.example.org/devup-fixture/story-${rawItemId}`,
    publishedAt: now,
    tags: [],
    sourceRank: 1 - index / ids.length,
  }));
  const edition = (language: "tr" | "en") => ({
    title:
      language === "tr"
        ? "PostgreSQL 19, Rust güvenlik düzeltmesi ve açık kodlama modeli"
        : "PostgreSQL 19, a Rust soundness fix and an open coding model",
    intro:
      language === "tr"
        ? "Geliştiriciler için doğrulanmış teknoloji güncellemeleri."
        : "Technology updates with useful details for developers.",
    news: pool.map((candidate, index) => ({
      rawItemId: candidate.rawItemId,
      category: stories[index % stories.length][2],
      title:
        language === "tr"
          ? stories[index % stories.length][1]
          : stories[index % stories.length][0],
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
