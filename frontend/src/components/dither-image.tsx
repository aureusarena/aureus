"use client";

import { useEffect, useRef } from "react";

/* ─── 8×8 Bayer matrix for ordered dithering ─── */
const BAYER8 = [
  [0, 48, 12, 60, 3, 51, 15, 63],
  [32, 16, 44, 28, 35, 19, 47, 31],
  [8, 56, 4, 52, 11, 59, 7, 55],
  [40, 24, 36, 20, 43, 27, 39, 23],
  [2, 50, 14, 62, 1, 49, 13, 61],
  [34, 18, 46, 30, 33, 17, 45, 29],
  [10, 58, 6, 54, 9, 57, 5, 53],
  [42, 26, 38, 22, 41, 25, 37, 21],
];

interface DitherImageProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  /** Color for "on" pixels — default: white */
  lightColor?: [number, number, number];
  /** Color for "off" pixels — default: match background blue */
  darkColor?: [number, number, number];
  /** Pixel size of each dither dot (1 = native res, 2 = chunky retro, 3+ = bold) */
  pixelSize?: number;
  /** Threshold bias 0-1, lower = more light dots */
  bias?: number;
}

export function DitherImage({
  src,
  className = "",
  style = {},
  lightColor = [255, 255, 255],
  darkColor = [36, 65, 255], // #2441ff
  pixelSize = 3,
  bias = 0.5,
}: DitherImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Work at reduced resolution for the chunky dither look
      const w = Math.ceil(img.width / pixelSize);
      const h = Math.ceil(img.height / pixelSize);

      // Set canvas to final display size (original image size)
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw image at reduced size to sample it
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const offCtx = offscreen.getContext("2d", { willReadFrequently: true })!;
      offCtx.drawImage(img, 0, 0, w, h);
      const imageData = offCtx.getImageData(0, 0, w, h);
      const data = imageData.data;

      // Disable smoothing for crisp pixel art scaling
      ctx.imageSmoothingEnabled = false;

      // Process each pixel
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a < 10) {
            // Transparent pixel — skip (draw nothing)
            continue;
          }

          // Luminance
          const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

          // Bayer threshold
          const bx = x % 8;
          const by = y % 8;
          const threshold = (BAYER8[by][bx] + 0.5) / 64;

          // Adjusted threshold with bias
          const adjusted = luma + (bias - 0.5) * 0.3;

          // Choose color
          const isLight = adjusted > threshold;
          const [cr, cg, cb] = isLight ? lightColor : darkColor;

          // Draw a pixelSize×pixelSize block
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${a / 255})`;
          ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
        }
      }
    };
    img.src = src;
  }, [src, lightColor, darkColor, pixelSize, bias]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ ...style, imageRendering: "pixelated" }}
    />
  );
}
