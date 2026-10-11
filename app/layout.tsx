import type { Metadata } from "next";
import { Suspense } from "react";
import LocalizedApplication from "@/components/i18n/localized-application";
import { site, siteUrl } from "@/lib/site";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <LocalizedApplication>{children}</LocalizedApplication>
        </Suspense>
      </body>
    </html>
  );
}
