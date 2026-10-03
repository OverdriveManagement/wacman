"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#004968" />
        <path d="M14 22l7 22 6-15 5 15 6-15 5 15 7-22" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-lg font-bold tracking-tight text-ink">WacMan</span>
          <span className="block text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted">Wifirst Account Management</span>
        </span>
      )}
    </span>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("wacman-theme", next);
    } catch {
      /* préférence non mémorisée */
    }
  };
  return (
    <button className="btn btn-ghost btn-sm" onClick={flip} title={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"} aria-label="Changer de thème">
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}
