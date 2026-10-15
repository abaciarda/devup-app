import type { Metadata } from "next";
import LocalizedApplication from "@/components/i18n/localized-application";
import { site, siteUrl } from "@/lib/site";
import { getRequestLanguages } from "@/lib/request-language";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl ?? new URL("http://localhost:3001"),
  title: { default: site.title, template: "%s — devup" },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    title: site.title,
    description: site.description,
    siteName: site.name,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
  },
  robots: { index: Boolean(siteUrl), follow: true },
};

export const instant = false;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const languages = await getRequestLanguages();
  return (
    <html lang={languages.language}>
      <body>
        <LocalizedApplication languages={languages}>
          {children}
        </LocalizedApplication>
      </body>
    </html>
  );
}
