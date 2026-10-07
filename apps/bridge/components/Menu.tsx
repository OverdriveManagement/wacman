"use client";

/** Menu contextuel « ⋯ » (repris de WacMan) : rendu à la racine pour ne pas être rogné par un tableau défilant. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// Menu contextuel « ⋯ »
// ---------------------------------------------------------------------------

export type MenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode } | "sep";

/** Bouton « ⋯ » qui ouvre un petit menu ; rendu à la racine pour ne pas être rogné par un tableau défilant. */
export function Menu({ items, label = "Options", className = "", trigger }: { items: MenuItem[]; label?: string; className?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = 230;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const visible = items.filter((i) => i === "sep" || !i.disabled);
  if (!visible.some((i) => i !== "sep")) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={trigger ? className : `inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink ${className}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {trigger ?? <span className="text-lg leading-none">⋯</span>}
      </button>
      {open &&
        pos &&
        createPortal(
          <div className="fixed inset-0 z-[70]" onMouseDown={() => setOpen(false)}>
            <div
              role="menu"
              className="fadein absolute w-[230px] rounded-xl border border-line bg-surface p-1 shadow-2xl"
              style={{ top: pos.top, left: pos.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {visible.map((it, i) =>
                it === "sep" ? (
                  <div key={i} className="my-1 h-px bg-line-soft" />
                ) : (
                  <button
                    key={i}
                    role="menuitem"
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 ${it.danger ? "text-red" : "text-ink-2"}`}
                    onClick={() => {
                      setOpen(false);
                      it.onClick();
                    }}
                  >
                    {it.icon}
                    {it.label}
                  </button>
                ),
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

