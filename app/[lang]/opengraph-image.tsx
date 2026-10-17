import { ImageResponse } from "next/og";
import { isLanguage } from "@/lib/localized-routes";

export const alt = "devup";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const copy = {
  tr: {
    lines: ["Her sabah teknoloji özeti.", "Beş dakikada oku."],
    footer: "Teknoloji, yazılım ve yapay zekâ haberleri · Türkçe ve İngilizce",
  },
  en: {
    lines: ["Your daily tech briefing.", "Read it in five minutes."],
    footer: "Technology, software and AI news · Turkish and English",
  },
};

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const text = copy[isLanguage(lang) ? lang : "tr"];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "#f5f5f7",
        color: "#1d1d1f",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 32,
          color: "#0066cc",
          marginBottom: 36,
        }}
      >
        devup ↗
      </div>
      <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: -3 }}>
        {text.lines[0]}
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 600,
          letterSpacing: -3,
          color: "#6e6e73",
        }}
      >
        {text.lines[1]}
      </div>
      <div style={{ fontSize: 25, marginTop: 36, color: "#6e6e73" }}>
        {text.footer}
      </div>
    </div>,
    size,
  );
}
