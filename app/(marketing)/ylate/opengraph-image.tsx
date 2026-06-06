import { ImageResponse } from "next/og";

export const alt = "Ylate — YouTrack time tracker for VS Code & desktop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0a",
          color: "#fafafa",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa" }}>Full House</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 96, fontWeight: 700 }}>Ylate</div>
          <div style={{ display: "flex", fontSize: 40, color: "#d4d4d8", maxWidth: 900 }}>
            A YouTrack time tracker for VS Code &amp; the desktop
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 28, color: "#a1a1aa" }}>
          <span>Windows · macOS · Linux · VS Code</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
