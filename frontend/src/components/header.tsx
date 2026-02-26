"use client";

import Link from "next/link";
import { DitherImage } from "@/components/dither-image";

interface HeaderProps {
  rightLabel?: string;
}

export function Header({ rightLabel }: HeaderProps) {
  return (
    <nav className="relative z-30 flex items-center justify-between px-10 py-7 max-w-[1400px] mx-auto w-full">
      <Link
        href="/"
        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
      >
        <div className="w-10 h-10 rounded-full overflow-hidden">
          <DitherImage
            src="/assets/gold-nugget.png"
            className="w-full h-full"
            lightColor={[255, 200, 50]}
            darkColor={[36, 65, 255]}
            pixelSize={2}
            bias={0.5}
          />
        </div>
        <span className="text-xl tracking-[0.15em] font-semibold uppercase">
          AUREUS
        </span>
      </Link>

      {rightLabel ? (
        <span className="text-xs text-white/40 tracking-wider uppercase">
          {rightLabel}
        </span>
      ) : (
        <div className="hidden md:flex items-center gap-16 text-[13px] tracking-[0.25em] uppercase font-medium">
          <Link href="/stake" className="hover:opacity-60 transition-opacity">
            Stake
          </Link>
          <Link href="/matches" className="hover:opacity-60 transition-opacity">
            Matches
          </Link>
          <Link href="/docs" className="hover:opacity-60 transition-opacity">
            Docs
          </Link>
          <Link
            href="/dashboard"
            className="hover:opacity-60 transition-opacity"
          >
            Protocol
          </Link>
          <Link
            href="/#leaderboard"
            className="hover:opacity-60 transition-opacity"
          >
            Leaderboard
          </Link>
        </div>
      )}
    </nav>
  );
}
