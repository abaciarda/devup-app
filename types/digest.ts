export type Language = "en" | "tr";
export type Story = {
  topic: string;
  source: string;
  title: string;
  summary: string;
  url: string;
};
export type Edition = {
  slug: string;
  date: string;
  title: string;
  intro: string;
  stories: readonly Story[];
};
