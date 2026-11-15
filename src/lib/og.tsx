import { ImageResponse } from "next/og";
import { SITE } from "./site";

/** Shared 1200×630 social card: editorial, text-only (never uses Google photos). */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export function ogCard({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const titleSize = title.length > 34 ? 72 : title.length > 22 ? 88 : 104;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          color: "#161616",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, textTransform: "uppercase", color: "#6b6b6b" }}>{eyebrow}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: titleSize, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>{title}</div>
          {subtitle ? (
            <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: "#3d3d3d", lineHeight: 1.35, maxWidth: 980 }}>{subtitle}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #161616", paddingTop: 24, fontSize: 26 }}>
          <span style={{ fontWeight: 700 }}>{SITE.name}</span>
          <span style={{ color: "#6b6b6b" }}>{SITE.url.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
