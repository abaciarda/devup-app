import { site } from "@/lib/site";
import { ImageResponse } from "next/og";

export const alt = "devup — Daily tech news for developers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
        {site.name} ↗
      </div>
      <div style={{ fontSize: 72, fontWeight: 600, letterSpacing: -3 }}>
        Your daily tech briefing.
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 600,
          letterSpacing: -3,
          color: "#6e6e73",
        }}
      >
        Read it in five minutes.
      </div>
      <div style={{ fontSize: 25, marginTop: 36, color: "#6e6e73" }}>
        Technology, software and AI news.
      </div>
    </div>,
    size,
  );
}
