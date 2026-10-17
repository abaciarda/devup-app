import { ImageResponse } from "next/og";
import { isLanguage } from "@/lib/localized-routes";
import { publicCopy } from "@/lib/public-issues";
import { loadPublishedIssue } from "@/lib/server/issues/published";

export const alt = "devup";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function EditionImage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  const issue = await loadPublishedIssue(slug);
  const edition = issue?.content[language];
  const label = issue
    ? `${publicCopy[language].issue} #${issue.editionNumber} · ${issue.date}`
    : "devup";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#f5f5f7",
        color: "#1d1d1f",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 32, color: "#0066cc" }}>
        devup ↗
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 26, color: "#6e6e73", marginBottom: 24 }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 58,
            fontWeight: 600,
            letterSpacing: -2,
            lineHeight: 1.12,
          }}
        >
          {edition?.title ?? "devup"}
        </div>
      </div>
      <div style={{ fontSize: 24, color: "#6e6e73" }}>
        {edition
          ? `${edition.news.length} ${publicCopy[language].stories}`
          : ""}
      </div>
    </div>,
    size,
  );
}
