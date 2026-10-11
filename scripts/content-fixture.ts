import {
  parseIssueContent,
  type IssueContent,
  type NewsStory,
} from "../types/issue-content";

export function makeExampleContent(
  rawItemIds: number[] = [1, 2, 3, 4, 5],
): IssueContent {
  const englishNews: NewsStory[] = rawItemIds.map((rawItemId, index) => ({
    rawItemId,
    category: "software",
    sourceKey: "hackernews",
    title: `Example story ${index + 1}`,
    summary:
      "This synthetic story exists only to check the content format during development.",
    url: `https://example.com/task-02/story-${index + 1}`,
  }));

  const turkishNews: NewsStory[] = englishNews.map((story, index) => ({
    ...story,
    title: `Örnek haber ${index + 1}`,
    summary:
      "Bu örnek haber yalnızca geliştirme sırasında içerik biçimini doğrulamak için kullanılır.",
  }));

  return parseIssueContent({
    version: 1,
    featuredRawItemIds: rawItemIds.slice(0, 3),
    tr: {
      title: "Geliştirme için örnek bülten",
      intro:
        "Bu bülten gerçek haber değildir; yalnızca içerik biçimini doğrular.",
      news: turkishNews,
    },
    en: {
      title: "Example issue for development",
      intro: "This issue contains synthetic data to verify the content format.",
      news: englishNews,
    },
  });
}
