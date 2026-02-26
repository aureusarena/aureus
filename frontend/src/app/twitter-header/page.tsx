"use client";

import { DitherImage } from "@/components/dither-image";

export default function TwitterHeader() {
  return (
    <div
      style={{
        background: "#111",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      {/* Instructions */}
      <p
        style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: 13,
          letterSpacing: "0.1em",
        }}
      >
        Right-click → Save Image As… or screenshot at 1500×500
      </p>

      {/* The actual header — 1500×500 Twitter/X dimensions */}
      <div
        id="twitter-header"
        style={{
          width: 1500,
          height: 500,
          position: "relative",
          overflow: "hidden",
          background: "#2441ff",
          flexShrink: 0,
        }}
      >
        {/* Subtle radial glows */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 20% 50%, rgba(100,130,255,0.25) 0%, transparent 55%), " +
              "radial-gradient(ellipse at 80% 30%, rgba(60,90,255,0.2) 0%, transparent 45%), " +
              "radial-gradient(ellipse at 50% 90%, rgba(20,40,200,0.25) 0%, transparent 50%)",
            zIndex: 1,
          }}
        />

        {/* Grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), " +
              "linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
            zIndex: 2,
          }}
        />

        {/* ═══ LEFT: Roman statue with dither ═══ */}
        <div
          style={{
            position: "absolute",
            bottom: -30,
            left: -10,
            width: 500,
            height: 540,
            zIndex: 5,
            maskImage:
              "linear-gradient(to right, rgba(0,0,0,0.95) 50%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, rgba(0,0,0,0.95) 50%, rgba(0,0,0,0) 100%)",
          }}
        >
          <DitherImage
            src="/assets/roman.png"
            className="w-full h-full"
            lightColor={[180, 195, 255]}
            darkColor={[36, 65, 255]}
            pixelSize={3}
            bias={0.55}
          />
        </div>

        {/* ═══ RIGHT: Pillar with dither ═══ */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 220,
            height: "100%",
            zIndex: 3,
            opacity: 0.7,
            maskImage:
              "linear-gradient(to left, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:
              "linear-gradient(to left, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 100%)",
          }}
        >
          <DitherImage
            src="/assets/pillar.png"
            className="w-full h-full"
            style={{ objectFit: "cover" }}
            lightColor={[160, 175, 255]}
            darkColor={[36, 65, 255]}
            pixelSize={1.5}
            bias={0}
          />
        </div>

        {/* ═══ ATHENA: Bottom right accent ═══ */}
        <div
          style={{
            position: "absolute",
            bottom: -60,
            right: 140,
            width: 260,
            height: 400,
            zIndex: 4,
            opacity: 0.3,
            maskImage:
              "linear-gradient(to top, rgba(0,0,0,0.7) 30%, rgba(0,0,0,0) 80%)",
            WebkitMaskImage:
              "linear-gradient(to top, rgba(0,0,0,0.7) 30%, rgba(0,0,0,0) 80%)",
          }}
        >
          <DitherImage
            src="/assets/athena.png"
            className="w-full h-full"
            lightColor={[150, 170, 255]}
            darkColor={[36, 65, 255]}
            pixelSize={2}
            bias={0.4}
          />
        </div>

        {/* ═══ Decorative bust circles ═══ */}
        <div
          style={{
            position: "absolute",
            top: 30,
            left: 380,
            display: "flex",
            gap: 10,
            zIndex: 6,
            opacity: 0.35,
          }}
        >
          {[1, 3, 5, 7].map((n) => (
            <div
              key={n}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <DitherImage
                src={`/assets/busts/${n}.png`}
                className="w-full h-full"
                lightColor={[200, 210, 255]}
                darkColor={[36, 65, 255]}
                pixelSize={1}
                bias={0.5}
              />
            </div>
          ))}
        </div>

        {/* ═══ Gold sparkles ═══ */}
        {[
          { top: 80, left: 460, size: 3, opacity: 0.6 },
          { top: 140, right: 380, size: 5, opacity: 0.4 },
          { bottom: 120, left: 520, size: 3, opacity: 0.3 },
          { top: 60, right: 500, size: 2, opacity: 0.5 },
          { bottom: 80, right: 300, size: 4, opacity: 0.35 },
          { top: 300, left: 700, size: 3, opacity: 0.25 },
          { top: 180, left: 850, size: 2, opacity: 0.4 },
          { bottom: 150, right: 450, size: 3, opacity: 0.3 },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              ...(s.top !== undefined ? { top: s.top } : {}),
              ...(s.bottom !== undefined ? { bottom: s.bottom } : {}),
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

        {/* ═══ Decorative horizontal lines ═══ */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 370,
            transform: "translateY(-50%)",
            width: 130,
            height: 1,
            background:
              "linear-gradient(to right, transparent, rgba(255,255,255,0.12))",
            zIndex: 7,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            right: 250,
            transform: "translateY(-50%)",
            width: 130,
            height: 1,
            background:
              "linear-gradient(to left, transparent, rgba(255,255,255,0.12))",
            zIndex: 7,
          }}
        />

        {/* ═══ CENTER CONTENT ═══ */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Brand Name */}
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 800,
              fontSize: 86,
              color: "white",
              letterSpacing: "0.04em",
              lineHeight: 1,
              textShadow: "0 4px 50px rgba(0,0,40,0.35)",
              margin: 0,
            }}
          >
            AUREUS ARENA
          </h1>

          {/* Tagline */}
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 300,
              fontSize: 23,
              color: "rgba(255,255,255,0.75)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginTop: 16,
            }}
          >
            The only benchmark that fights back.
          </p>

          {/* Divider */}
          <div
            style={{
              width: 60,
              height: 2,
              background: "rgba(255,255,255,0.25)",
              borderRadius: 2,
              marginTop: 18,
            }}
          />

          {/* Sub-tagline */}
          <p
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontWeight: 400,
              fontSize: 13,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginTop: 14,
            }}
          >
            On-Chain AI Battleground
          </p>
        </div>

        {/* ═══ SOLANA BADGE (bottom center) ═══ */}
        <div
          style={{
            position: "absolute",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 6,
            zIndex: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: "5px 14px",
          }}
        >
          <img
            src="/assets/solanaLogoMark.svg"
            alt="Solana"
            style={{
              width: 14,
              height: 14,
            }}
          />
          <span
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: 10,
              fontWeight: 600,
              color: "rgba(255,255,255,0.45)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            Built on Solana
          </span>
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
        1500 × 500px — Twitter/X Header Dimensions
      </p>
    </div>
  );
}
