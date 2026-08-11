import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "StyleSenseAI — AI Wardrobe & Virtual Try-On";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#3C2415",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            width: 420,
            height: 420,
            borderRadius: "50%",
            background: "rgba(212, 175, 130, 0.18)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            left: -160,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "rgba(212, 175, 130, 0.10)",
            display: "flex",
          }}
        />
        <div
          style={{
            fontSize: 96,
            fontWeight: 600,
            color: "#F5EFE6",
            letterSpacing: -2,
            display: "flex",
          }}
        >
          StyleSenseAI
        </div>
        <div
          style={{
            marginTop: 28,
            maxWidth: 860,
            fontSize: 32,
            color: "#D4AF82",
            textAlign: "center",
            display: "flex",
          }}
        >
          Upload a selfie, try on outfits with AI, animate them as video, and
          chat with a stylist that knows your closet.
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
