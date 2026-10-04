"use client";

/** Briques communes aux pages de revue (revue de stream, bilan de sprint). */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { frDate, isOverdue } from "@/lib/format";
import type { Card, ReviewCard } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { FreshnessTag } from "./Freshness";
import { Pill } from "./ui";

/** Ouvre la fiche complète d'une carte à partir de son identifiant. */
export function useOpenCard() {
  const acc = useAcc();
  const [card, setCard] = useState<Card | null>(null);
  const open = async (id: string) => {
    try {
      setCard(await api<Card>(`${acc.base}/e/card/${id}`));
    } catch {
      /* message déjà affiché */
    }
  };
  return { card, open, close: () => setCard(null) };
}

export function ReviewSection({ icon, title, count, children, actions, className = "" }: { icon: string; title: string; count?: number; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card p-3 md:p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base font-bold text-ink">
          {icon} {title}
          {count !== undefined && <span className="ml-1.5 text-sm font-semibold text-muted">({count})</span>}
        </h2>
        <div className="flex-1" />
        {actions}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, tone: t = "ink", hint }: { label: string; value: ReactNode; tone?: "ink" | "teal" | "ocre" | "red" | "accent"; hint?: string }) {
  const color = { ink: "text-ink", teal: "text-teal", ocre: "text-ocre", red: "text-red", accent: "text-accent" }[t];
  return (
    <div className="rounded-xl border border-line-soft bg-surface-2/50 px-3 py-2.5">
      <div className={`font-display text-2xl font-bold leading-tight ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-muted">{label}</div>
      {hint && <div className="text-[0.68rem] text-muted">{hint}</div>}
    </div>
  );
}

/** Ligne de livrable : référence, titre, alerte, échéance, porteur, fraîcheur ; notes en option. */
export function ReviewCardRow({ c, onOpen, details = false, showStream = false, showStatus = false }: { c: ReviewCard; onOpen: (id: string) => void; details?: boolean; showStream?: boolean; showStatus?: boolean }) {
  const acc = useAcc();
  const level = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;
  const status = c.statusId ? acc.opt.get(c.statusId) : null;
  const owner = c.ownerId ? acc.ctc.get(c.ownerId)?.name : "";
  const stream = c.streamId ? acc.str.get(c.streamId)?.name : "";
  const done = acc.isDone(c.statusId);
  const late = !done && isOverdue(c.dueDate);
  const note = (label: string, text: string, cls = "text-ink-2") =>
    text.trim() ? (
      <p className={`mt-0.5 whitespace-pre-line text-xs ${cls} [overflow-wrap:anywhere]`}>
        <b>{label} :</b> {text.trim().slice(0, 600)}
      </p>
    ) : null;
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button className="min-w-0 text-left text-sm text-ink hover:text-accent hover:underline [overflow-wrap:anywhere]" onClick={() => onOpen(c.id)}>
          <span className="text-muted">#{c.ref}</span> {c.emoji ? `${c.emoji} ` : ""}
          <span className={done ? "line-through decoration-teal" : ""}>{c.title}</span>
        </button>
        {showStatus && status && <Pill option={status} small />}
        {level && <Pill option={level} small />}
        {showStream && stream && <span className="text-xs font-semibold text-ocre">{stream}</span>}
        {c.dueDate && <span className={`text-xs ${late ? "font-semibold text-red" : "text-muted"}`}>{late ? "En retard, " : ""}échéance {frDate(c.dueDate, false)}</span>}
        {owner && <span className="text-xs text-ink-2">{owner}</span>}
        <FreshnessTag card={{ contentUpdatedAt: c.contentUpdatedAt, updatedAt: c.contentUpdatedAt, statusId: c.statusId }} />
      </div>
      {level && note("Alertes", c.alertsNote, "text-red")}
      {details && note("Avancement", c.progressNote)}
      {details && note("Prochaines étapes", c.nextSteps)}
    </li>
  );
}

/**
 * Mode présentation : la page passe en plein écran, sans menu latéral, avec un texte plus grand.
 * Échap quitte ; les flèches gauche et droite appellent onPrev et onNext.
 */
export function usePresentation(onPrev?: () => void, onNext?: () => void) {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useRef({ onPrev, onNext });
  nav.current = { onPrev, onNext };
  useEffect(() => {
    if (!on) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      if (e.key === "Escape") setOn(false);
      if (e.key === "ArrowLeft") nav.current.onPrev?.();
      if (e.key === "ArrowRight") nav.current.onNext?.();
    };
    const fs = () => !document.fullscreenElement && setOn(false);
    window.addEventListener("keydown", h);
    document.addEventListener("fullscreenchange", fs);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.removeEventListener("fullscreenchange", fs);
      document.body.style.overflow = "";
    };
  }, [on]);
  const start = async () => {
    setOn(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* plein écran refusé (iPhone) : la vue occupe tout de même la fenêtre */
    }
  };
  const stop = async () => {
    setOn(false);
    if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => undefined);
  };
  const wrap = (children: ReactNode, bar: ReactNode) =>
    on ? (
      <div ref={ref} className="fixed inset-0 z-40 overflow-y-auto bg-bg" data-testid="presentation">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line-soft bg-surface/95 px-4 py-2 backdrop-blur">
          {bar}
          <div className="flex-1" />
          <button className="btn btn-sm" onClick={stop}>
            Quitter la présentation
          </button>
        </div>
        <div className="mx-auto max-w-7xl p-4 md:p-6 md:[zoom:1.12]">{children}</div>
      </div>
    ) : (
      children
    );
  return { on, start, stop, wrap };
}
