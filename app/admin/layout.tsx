import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteOrigin } from "@/lib/seo";
import "../globals.css";
import "./admin.css";

export const metadata: Metadata = {
  metadataBase: siteOrigin,
  title: "Private admin",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="admin-shell">{children}</div>
      </body>
    </html>
  );
}
