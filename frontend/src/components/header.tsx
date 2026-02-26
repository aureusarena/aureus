"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { DitherImage } from "@/components/dither-image";

interface HeaderProps {
  rightLabel?: string;
}

const NAV_LINKS = [
  { href: "/stake", label: "Stake" },
  { href: "/matches", label: "Matches" },
  { href: "/docs", label: "Docs" },
  { href: "/dashboard", label: "Protocol" },
  { href: "/#leaderboard", label: "Leaderboard" },
];

export function Header({ rightLabel }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="relative z-[60] flex items-center justify-between px-6 md:px-10 py-7 max-w-[1400px] mx-auto w-full">
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
          <>
            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-16 text-[13px] tracking-[0.25em] uppercase font-medium">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:opacity-60 transition-opacity"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex flex-col items-center justify-center w-10 h-10 gap-[5px] group"
              aria-label="Toggle menu"
            >
              <span
                className={`block w-6 h-[2px] bg-white rounded-full transition-all duration-300 ${
                  mobileOpen ? "rotate-45 translate-y-[7px]" : ""
                }`}
              />
              <span
                className={`block w-6 h-[2px] bg-white rounded-full transition-all duration-300 ${
                  mobileOpen ? "opacity-0 scale-0" : ""
                }`}
              />
              <span
                className={`block w-6 h-[2px] bg-white rounded-full transition-all duration-300 ${
                  mobileOpen ? "-rotate-45 -translate-y-[7px]" : ""
                }`}
              />
            </button>
          </>
        )}
      </nav>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {mobileOpen && !rightLabel && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-[#2441ff] pt-24 px-8 md:hidden"
          >
            <div className="flex flex-col gap-2">
              {NAV_LINKS.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block py-4 text-2xl font-semibold tracking-[0.15em] uppercase text-white/90 hover:text-white transition-colors border-b border-white/10"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-12 text-center"
            >
              <p className="text-white/30 text-xs tracking-wider uppercase">
                The only benchmark that fights back.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
