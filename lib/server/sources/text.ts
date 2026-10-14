import "server-only";
import { httpUrlSchema } from "../../../types/issue-content";

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function plainSourceText(input: string, maxLength = 12_000): string {
  return input
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
      (whole: string, entity: string) => {
        if (!entity.startsWith("#"))
          return entities[entity.toLowerCase()] ?? whole;
        const hex = entity[1].toLowerCase() === "x";
        const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (
          point <= 0 ||
          point > 0x10ffff ||
          (point >= 0xd800 && point <= 0xdfff)
        ) {
          return " ";
        }
        return String.fromCodePoint(point);
      },
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeStoryUrl(input: string): string {
  const url = new URL(httpUrlSchema.parse(input));
  if (url.username !== "" || url.password !== "") {
    throw new Error("Story links must not contain credentials");
  }

  const trackingKeys = new Set([
    "fbclid",
    "gclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
  ]);
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || trackingKeys.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export function isNewsPost(title: string, tags: string[]): boolean {
  return (
    !/\b(?:who['’]?s hiring|who wants to be hired|job openings?|career advice)\b/i.test(
      title,
    ) &&
    !tags.some((tag) =>
      ["jobs", "hiring", "career"].includes(tag.toLowerCase()),
    )
  );
}

export function hasUsefulSourceText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= 300 && trimmed.split(/\s+/).length >= 40;
}

export function newsRejection(
  title: string,
  tags: string[],
  text = "",
): string | null {
  if (!isNewsPost(title, tags)) return "not_news";
  if (
    /\b(pets?|gardening|garden trials|watercooler|weekend|dev pet corner|coffee chat)\b/i.test(
      title,
    ) ||
    tags.some((tag) =>
      ["watercooler", "introductions", "devchallenge"].includes(
        tag.toLowerCase(),
      ),
    )
  )
    return "community_or_lifestyle";
  if (
    /^(?:how to|a beginner['’]?s|getting started|step.by.step|i built|my first|why i|what i learned)\b/i.test(
      title,
    ) ||
    tags.some((tag) => ["tutorial", "beginners"].includes(tag.toLowerCase()))
  )
    return "tutorial_or_personal_post";
  const evidence = `${title} ${tags.join(" ")} ${text.slice(0, 3000)}`;
  if (
    !/\b(ai|llm|models?|software|developers?|programming|code|coding|security|vulnerabilit\w*|rust|python|javascript|typescript|linux|database|postgres\w*|sqlite|browser|gpu|inference|open.source|compiler|api|cloud|encryption|machine learning|benchmark|research|algorithm|computing|hardware|devops|network\w*|internet|http|infrastructure)\b/i.test(
      evidence,
    )
  )
    return "not_technology";
  if (
    !/\b(releas\w*|launch\w*|announc\w*|introduc\w*|updat\w*|new|adds?|improv\w*|discov\w*|research|paper|benchmark|vulnerabilit\w*|breach|acqui\w*|deprecat\w*|security|v\d|\d+\.\d+)\b/i.test(
      evidence,
    )
  )
    return "no_concrete_development";
  return null;
}
