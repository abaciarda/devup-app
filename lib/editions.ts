import type { Edition } from "@/types/digest";

export const editions: readonly Edition[] = [
  {
    slug: "2026-10-11",
    date: "2026-10-11",
    title: "The tools changing how developers work",
    intro:
      "A quick look at the ideas and releases developers are discussing today.",
    stories: [
      {
        topic: "AI & SOFTWARE",
        source: "Hacker News",
        title: "The new shape of AI-assisted software development",
        summary:
          "Developers are finding practical ways to bring AI into their daily workflows while keeping code review and software quality in focus.",
        url: "https://news.ycombinator.com/",
      },
      {
        topic: "OPEN SOURCE",
        source: "Dev.to",
        title: "Small tools, thoughtful engineering",
        summary:
          "A collection of useful ideas from the people building and maintaining software in the open.",
        url: "https://dev.to/",
      },
      {
        topic: "COMMUNITY",
        source: "Reddit",
        title: "What developers are learning this week",
        summary:
          "Community conversations highlight the skills, tools, and habits developers are exploring right now.",
        url: "https://www.reddit.com/r/programming/",
      },
    ],
  },
  {
    slug: "2026-10-10",
    date: "2026-10-10",
    title: "A practical day in software",
    intro: "The stories and discussions worth catching up on from yesterday.",
    stories: [
      {
        topic: "ENGINEERING",
        source: "Hacker News",
        title: "A closer look at software reliability",
        summary:
          "Engineers shared lessons on building systems that remain understandable and dependable as they grow.",
        url: "https://news.ycombinator.com/",
      },
      {
        topic: "DEVELOPER TOOLS",
        source: "Dev.to",
        title: "Making everyday development smoother",
        summary:
          "A few small workflow improvements can make a meaningful difference to a team's day-to-day work.",
        url: "https://dev.to/",
      },
      {
        topic: "COMMUNITY",
        source: "Reddit",
        title: "The questions developers are asking",
        summary:
          "Recent discussions cover software reliability, new technologies, and the tools developers rely on.",
        url: "https://www.reddit.com/r/programming/",
      },
    ],
  },
  {
    slug: "2026-10-09",
    date: "2026-10-09",
    title: "What developers are talking about",
    intro:
      "Three useful reads from the latest conversations across tech communities.",
    stories: [
      {
        topic: "SOFTWARE",
        source: "Hacker News",
        title: "Building software with care",
        summary:
          "A discussion about the decisions that make software easier to maintain over time.",
        url: "https://news.ycombinator.com/",
      },
      {
        topic: "OPEN SOURCE",
        source: "Dev.to",
        title: "Learning in public",
        summary:
          "Developers shared ways to learn new skills while contributing to the wider community.",
        url: "https://dev.to/",
      },
      {
        topic: "COMMUNITY",
        source: "Reddit",
        title: "Tools and ideas worth sharing",
        summary:
          "A snapshot of the practical recommendations circulating among developers.",
        url: "https://www.reddit.com/r/programming/",
      },
    ],
  },
];

export function getEdition(slug: string) {
  return editions.find((edition) => edition.slug === slug);
}
