export const site = {
  name: "devup",
  title: "devup — Daily tech news for developers",
  description:
    "A five-minute daily email with software and AI news, career leads, contest schedules, and coding problems worth solving.",
};
export const siteUrl = process.env.SITE_URL
  ? new URL(process.env.SITE_URL)
  : undefined;
