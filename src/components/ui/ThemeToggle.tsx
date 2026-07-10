"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Theme = "dark" | "light";

function preferredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("everlast_theme");
  if (stored === "dark" || stored === "light") return stored;
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem("everlast_theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const next = preferredTheme();
      applyTheme(next);
      setTheme(next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="ki-pill ki-interactive fixed bottom-4 right-4 z-40 inline-flex h-11 items-center gap-2 pl-1.5 pr-3.5 text-sm text-ink shadow-card"
      aria-label={`Zu ${theme === "dark" ? "Light" : "Dark"} Mode wechseln`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-signal text-signal-ink shadow-glow">
        <Icon name={theme === "dark" ? "moon" : "sun"} size={15} />
      </span>
      <span className="label-caps hidden sm:inline">
        {theme === "dark" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
