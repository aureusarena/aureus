"use client";

import { AnimatePresence, motion, Variants } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface HyperTextProps {
  text: string;
  duration?: number;
  framerProps?: Variants;
  className?: string;
  animateOnLoad?: boolean;
}

const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

const getRandomInt = (max: number) => Math.floor(Math.random() * max);

export function HyperText({
  text,
  duration = 1200,
  framerProps = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  className,
  animateOnLoad = true,
}: HyperTextProps) {
  const [displayText, setDisplayText] = useState(text.split(""));
  const [trigger, setTrigger] = useState(false);
  const iterations = useRef(0);
  const isFirstRender = useRef(true);
  const prevText = useRef(text);

  // Re-trigger animation when text value changes
  useEffect(() => {
    if (prevText.current !== text) {
      prevText.current = text;
      iterations.current = 0;
      setTrigger((t) => !t);
    }
  }, [text]);

  const triggerAnimation = () => {
    iterations.current = 0;
    setTrigger((t) => !t);
  };

  useEffect(() => {
    const interval = setInterval(
      () => {
        if (!animateOnLoad && isFirstRender.current) {
          clearInterval(interval);
          isFirstRender.current = false;
          return;
        }
        if (iterations.current < text.length) {
          setDisplayText((t) =>
            t.map((l, i) =>
              l === " " || l === "." || l === "," || l === "%" || l === "-"
                ? l
                : i <= iterations.current
                  ? text[i]
                  : alphabets[getRandomInt(alphabets.length)],
            ),
          );
          iterations.current = iterations.current + 0.3;
        } else {
          setDisplayText(text.split(""));
          clearInterval(interval);
        }
      },
      duration / (text.length * 10),
    );
    return () => clearInterval(interval);
  }, [text, duration, trigger, animateOnLoad]);

  return (
    <span
      className="inline-flex cursor-default overflow-hidden"
      onMouseEnter={triggerAnimation}
    >
      <AnimatePresence mode="wait">
        {displayText.map((letter, i) => (
          <motion.span key={i} className={className} {...framerProps}>
            {letter}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}
