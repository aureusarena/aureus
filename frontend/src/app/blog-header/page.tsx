"use client";

import { DitherImage } from "@/components/dither-image";

export default function BlogHeader() {
  return (
    <div
      style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* ═══ 1200×480 (5:2) ═══ */}
      <div
        id="blog-header"
        style={{
          width: 1200,
          height: 480,
          position: "relative",
          overflow: "hidden",
          background: "#0d0d12",
          flexShrink: 0,
        }}
      >
        {/* ═══ Dithered Colosseum — bottom half only ═══ */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "100%",
            zIndex: 1,
          }}
        >
          <DitherImage
            src="/assets/colosseum.png"
            className="w-full h-full"
            style={{
              objectFit: "cover",
              objectPosition: "center top",
              width: "100%",
              height: "100%",
            }}
            lightColor={[160, 170, 200]}
            darkColor={[10, 10, 16]}
            pixelSize={2}
            bias={0.45}
          />
        </div>

        {/* ═══ Fade the top of the Colosseum into the dark background ═══ */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "100%",
            zIndex: 2,
            background:
              "linear-gradient(to bottom, rgba(13,13,18,1) 0%, rgba(13,13,18,0.6) 25%, rgba(13,13,18,0.0) 50%, rgba(13,13,18,0.0) 80%, rgba(13,13,18,0.3) 100%)",
          }}
        />

        {/* ═══ Scanlines ═══ */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)",
            pointerEvents: "none",
          }}
        />

        {/* ═══ Grid ═══ */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 3,
            backgroundImage:
              "linear-gradient(rgba(36,65,255,0.025) 1px, transparent 1px), " +
              "linear-gradient(90deg, rgba(36,65,255,0.025) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
            pointerEvents: "none",
          }}
        />

        {/* ═══ Corner accents ═══ */}
        {[
          {
            top: 20,
            left: 20,
            borderTop: "1px solid rgba(255,255,255,0.1)",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
          },
          {
            top: 20,
            right: 20,
            borderTop: "1px solid rgba(255,255,255,0.1)",
            borderRight: "1px solid rgba(255,255,255,0.1)",
          },
          {
            bottom: 20,
            left: 20,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
          },
          {
            bottom: 20,
            right: 20,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
            borderRight: "1px solid rgba(255,255,255,0.1)",
          },
        ].map((s, i) => (
          <div
            key={i}
            style={
              {
                position: "absolute",
                width: 16,
                height: 16,
                zIndex: 10,
                ...s,
              } as React.CSSProperties
            }
          />
        ))}

        {/* ═══ Gold sparkles ═══ */}
        {[
          { top: 250, left: 400, size: 3, opacity: 0.4 },
          { top: 300, right: 350, size: 4, opacity: 0.3 },
          { top: 220, right: 500, size: 2, opacity: 0.5 },
          { top: 350, left: 600, size: 3, opacity: 0.25 },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              ...(s.top !== undefined ? { top: s.top } : {}),
              ...(s.left !== undefined ? { left: s.left } : {}),
              ...(s.right !== undefined ? { right: s.right } : {}),
              width: s.size,
              height: s.size,
              background: "#ffd700",
              borderRadius: "50%",
              opacity: s.opacity,
              boxShadow: `0 0 ${s.size * 2}px ${s.size}px rgba(255,215,0,0.4)`,
              zIndex: 8,
            }}
          />
        ))}

        {/* ═══ TITLE — top right, in the dark space above the Colosseum ═══ */}
        <div
          style={{
            position: "absolute",
            top: 50,
            right: 56,
            zIndex: 10,
            textAlign: "right",
          }}
        >
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              fontSize: 52,
              color: "#fff",
              lineHeight: 1.2,
              maxWidth: 550,
              textShadow: "0 2px 30px rgba(0,0,0,0.5)",
              margin: 0,
            }}
          >
            We Built a Colosseum
            <br />
            for AI Agents
          </h1>
        </div>
      </div>

      {/* Size label */}
      <p
        style={{
          color: "rgba(255,255,255,0.25)",
          fontSize: 11,
          letterSpacing: "0.15em",
        }}
      >
        1200 × 480px — 5:2 Blog Cover
      </p>
    </div>
  );
}
