"use client";

import { useEffect, useState } from "react";

export function StartupIntro() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.sessionStorage.getItem("everlast_intro_seen") === "1") return;

    window.sessionStorage.setItem("everlast_intro_seen", "1");
    const frame = window.requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(() => setVisible(false), 2600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="intro-overlay fixed inset-0 z-50 grid place-items-center bg-ink/94 p-4 text-paper"
      aria-hidden="true"
    >
      <div className="intro-card relative max-w-xl border border-paper/25 bg-paper/[0.07] px-8 py-8 text-center shadow-pop backdrop-blur sm:px-12">
        <div className="intro-scanline" />
        <p className="label-caps mb-4 text-paper/55">Everlast / Notebook OS</p>
        <p className="intro-title font-sans text-2xl font-semibold tracking-tight sm:text-4xl">
          Moin, liebes Everlast-Team
        </p>
        <div className="mt-6 grid grid-cols-12 gap-1">
          {Array.from({ length: 12 }, (_, index) => (
            <span
              key={index}
              className="intro-tick h-1 border border-paper/40"
              style={{ animationDelay: `${index * 70}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
