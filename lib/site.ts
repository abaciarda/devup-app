export const site = {
  name: "devup",
  title: "devup — Daily tech news for developers",
  description:
    "A five-minute daily email summarizing technology, software, and AI news from developer communities.",
};
export const siteUrl = process.env.SITE_URL
  ? new URL(process.env.SITE_URL)
  : undefined;
