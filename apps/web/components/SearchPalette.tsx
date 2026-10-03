"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { frDate } from "@/lib/format";
import type { SearchResults } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { IconSearch, IconX } from "./icons";

type Hit = { key: string; group: string; title: string; sub: string; href: string };

/** Recherche globale du compte (Ctrl+K ou ⌘K) : cartes, risques, sujets, faits marquants, contacts, streams. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const acc = useAcc();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const slug = acc.data.account.slug;

  useEffect(() => {
    if (open) {
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await api<SearchResults>(`${acc.base}/search?q=${encodeURIComponent(term)}`, { silent: true });
        if (!cancelled) {
          setRes(r);
          setSel(0);
        }
      } catch {
        if (!cancelled) setRes(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, acc.base]);

  const hits = useMemo<Hit[]>(() => {
    if (!res) return [];
    const typeName = (id: string) => acc.data.meetingTypes.find((t) => t.id === id)?.name ?? "Séance";
    return [
      ...res.cards.map((c) => ({
        key: `c${c.id}`,
        group: "Cartes",
        title: `${c.emoji ? `${c.emoji} ` : ""}${c.title}`,
        sub: [`#${c.ref}`, c.streamId ? acc.str.get(c.streamId)?.name : "", c.statusId ? acc.opt.get(c.statusId)?.label : "", c.archived ? "archivée" : "", c.snippet].filter(Boolean).join(", "),
        href: `/a/${slug}?card=${c.id}`,
      })),
      ...res.risks.map((r) => ({ key: `r${r.id}`, group: "Risques et arbitrages", title: r.title, sub: [r.criticalityId ? acc.opt.get(r.criticalityId)?.label : "", r.snippet].filter(Boolean).join(", "), href: `/a/${slug}/risks?risk=${r.id}` })),
      ...res.topics.map((t) => ({ key: `t${t.id}`, group: "Sujets de séance", title: `${t.emoji ? `${t.emoji} ` : ""}${t.title}`, sub: [`${typeName(t.meetingTypeId)} du ${frDate(t.date)}`, t.snippet].filter(Boolean).join(", "), href: `/a/${slug}/meetings/${t.meetingTypeId}?m=${t.meetingId}` })),
      ...res.highlights.map((h) => ({ key: `h${h.id}`, group: "Faits marquants", title: `${h.emoji ? `${h.emoji} ` : ""}${h.title}`, sub: [`${typeName(h.meetingTypeId)} du ${frDate(h.date)}`, h.snippet].filter(Boolean).join(", "), href: `/a/${slug}/meetings/${h.meetingTypeId}?m=${h.meetingId}` })),
      ...res.streams.map((s) => ({ key: `s${s.id}`, group: "Streams", title: `${s.emoji} ${s.name}`, sub: [s.leader, s.prescriber].filter(Boolean).join(", "), href: `/a/${slug}/governance` })),
      ...res.contacts.map((c) => ({ key: `p${c.id}`, group: "Annuaire", title: c.name, sub: [c.role, c.company, c.email].filter(Boolean).join(", "), href: `/a/${slug}/governance` })),
    ];
  }, [res, acc, slug]);

  const go = (h?: Hit) => {
    if (!h) return;
    onClose();
    setQ("");
    router.push(h.href);
  };

  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-3 pt-[10vh]" onClick={onClose}>
      <div className="fadein w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Recherche">
        <div className="flex items-center gap-2 border-b border-line-soft px-4">
          <IconSearch className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
            placeholder="Rechercher une carte, un risque, un sujet, un contact…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(hits.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") go(hits[sel]);
            }}
          />
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {q.trim().length < 2 ? (
            <p className="px-4 py-3 text-sm text-muted">Tapez au moins 2 caractères. Un numéro (ex. 12 ou #12) retrouve une carte par sa référence. Les accents sont facultatifs.</p>
          ) : !res || res.query !== q.trim().slice(0, 100) ? (
            <p className="px-4 py-3 text-sm text-muted">Recherche…</p>
          ) : !hits.length ? (
            <p className="px-4 py-3 text-sm text-muted">Aucun résultat pour « {q.trim()} ».</p>
          ) : (
            hits.map((h, i) => {
              const head = h.group !== lastGroup ? h.group : null;
              lastGroup = h.group;
              return (
                <div key={h.key}>
                  {head && <div className="px-4 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">{head}</div>}
                  <button
                    className={`block w-full px-4 py-2 text-left ${i === sel ? "bg-petrol/50" : "hover:bg-surface-2"}`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(h)}
                  >
                    <div className="truncate text-sm font-semibold text-ink">{h.title}</div>
                    {h.sub && <div className="line-clamp-2 text-xs text-muted">{h.sub}</div>}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="hidden border-t border-line-soft px-4 py-2 text-[0.7rem] text-muted sm:block">Flèches pour choisir, Entrée pour ouvrir, Échap pour fermer.</div>
      </div>
    </div>
  );
}
