"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

/** Logo WiBridge : un pont entre Wifirst (bleu) et son client (ocre), sur le bleu pétrole de la charte Wifirst. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#004968" />
      <g transform="translate(0 -5)">
        <path d="M23 42V30.8M32 42V27M41 42V30.8" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        <path d="M14 42Q32 12 50 42" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M9 42h46" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="10" cy="42" r="5" fill="#4B8CF5" stroke="#004968" strokeWidth="2" />
        <circle cx="54" cy="42" r="5" fill="#E99A2C" stroke="#004968" strokeWidth="2" />
      </g>
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-lg font-bold tracking-tight text-ink">WiBridge</span>
          <span className="block text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted">Espace d'échange Wifirst</span>
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
      localStorage.setItem("wibridge-theme", next);
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
