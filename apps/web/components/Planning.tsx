"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, toast } from "@/lib/api";
import { frDate, todayIso, tone } from "@/lib/format";
import type { Card, Sprint } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Empty, Spinner } from "./ui";
import { IconChevronDown } from "./icons";

/**
 * Planning (Gantt) des cartes par stream : une barre par carte, du début prévu à l'échéance.
 * Couleur de la barre : niveau d'alerte (vigilance, alerte), sinon bleu ; carte terminée en vert pâle.
 * Sans dates propres, la barre reprend les dates du sprint (trait pointillé) ; avec une échéance seule, un jalon (losange).
 * Un clic sur le titre ouvre la carte ; un éditeur peut glisser la barre ou ses extrémités pour replanifier.
 */

const DAY = 86_400_000;
const t = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(t(d) + n * DAY);

type Bar = { start: string; end: string; implied: boolean; milestone: boolean };

export function cardBar(c: Card, spr: Map<string, Sprint>): Bar | null {
  const sp = c.sprintId ? spr.get(c.sprintId) : undefined;
  let start = c.startDate ?? sp?.startDate ?? null;
  let end = c.dueDate ?? sp?.endDate ?? null;
  if (!start && !end) return null;
  const milestone = !c.startDate && !sp?.startDate && !!c.dueDate;
  if (!start) start = end;
  if (!end) end = start;
  if (start! > end!) [start, end] = [end, start];
  return { start: start!, end: end!, implied: !c.startDate || !c.dueDate, milestone };
}

type Drag = { id: string; mode: "move" | "start" | "end"; x0: number; bar: Bar; delta: number; pointerId: number };

export function Planning({ cards, onOpen, onSaved }: { cards?: Card[]; onOpen: (c: Card) => void; onSaved: () => void }) {
  const acc = useAcc();
  const today = todayIso();
  const [zoom, setZoom] = useState<"week" | "month">("week");
  const [streamId, setStreamId] = useState<string>("");
  const [alertOnly, setAlertOnly] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [scope, setScope] = useState<"open" | "all">("open");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (v: Drag | null | ((d: Drag | null) => Drag | null)) => {
    const next = typeof v === "function" ? v(dragRef.current) : v;
    dragRef.current = next;
    setDragState(next);
  };
  const scroller = useRef<HTMLDivElement>(null);
  const px = zoom === "week" ? 22 : 7;
  const [left, setLeft] = useState(240);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const on = () => setLeft(q.matches ? 140 : 240);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);

  const sprints = useMemo(() => [...acc.data.sprints].sort((a, b) => a.order - b.order), [acc.data.sprints]);
  const openSprintIds = new Set(sprints.filter((s) => s.state !== "DONE").map((s) => s.id));
  const lanesAll = acc.data.streams.filter((s) => s.active && s.inKanban).sort((a, b) => a.order - b.order);

  const list = useMemo(
    () =>
      (cards ?? []).filter(
        (c) =>
          !c.archived &&
          (!streamId || c.streamId === streamId) &&
          (!alertOnly || c.alertLevelId) &&
          (!hideDone || !acc.isDone(c.statusId)) &&
          (scope === "all" || !c.sprintId || openSprintIds.has(c.sprintId)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, streamId, alertOnly, hideDone, scope, acc],
  );
  const bars = useMemo(() => new Map(list.map((c) => [c.id, cardBar(c, acc.spr)])), [list, acc.spr]);

  // fenêtre de temps : aujourd'hui, les sprints ouverts et toutes les barres, avec une marge
  const range = useMemo(() => {
    const pts = [t(today) - 14 * DAY, t(today) + 42 * DAY];
    for (const s of sprints) if (s.state !== "DONE" || scope === "all") [s.startDate, s.endDate].forEach((d) => d && pts.push(t(d)));
    bars.forEach((b) => b && pts.push(t(b.start), t(b.end)));
    let a = Math.min(...pts) - 7 * DAY;
    const b = Math.max(...pts) + 10 * DAY;
    a -= ((new Date(a).getUTCDay() + 6) % 7) * DAY; // commence un lundi
    return { a, days: Math.round((b - a) / DAY) + 1 };
  }, [bars, sprints, scope, today]);
  const W = range.days * px;
  const xOf = (d: string) => ((t(d) - range.a) / DAY) * px;

  // ouverture centrée sur aujourd'hui
  const scrollToday = () => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, xOf(today) - (el.clientWidth - left) / 3);
  };
  useEffect(() => {
    scrollToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, cards ? 1 : 0, left]);

  // ---------------------------------------------------------------- glisser pour replanifier
  const onPointerDown = (e: ReactPointerEvent, c: Card, bar: Bar, mode: Drag["mode"]) => {
    if (!acc.canEdit) return;
    if (e.pointerType === "mouse" && e.button !== 0) return; // clic droit : pas de glisser
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ id: c.id, mode: bar.milestone ? "move" : mode, x0: e.clientX, bar, delta: 0, pointerId: e.pointerId });
  };
  const preview = (b: Bar, d: Drag | null): Bar => {
    if (!d) return b;
    const k = d.delta;
    if (d.mode === "move") return { ...b, start: addDays(b.start, k), end: addDays(b.end, k) };
    if (d.mode === "start") return { ...b, start: addDays(b.start, Math.min(k, (t(b.end) - t(b.start)) / DAY)) };
    return { ...b, end: addDays(b.end, Math.max(k, -(t(b.end) - t(b.start)) / DAY)) };
  };
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => setDrag((d) => (d && e.pointerId === d.pointerId ? { ...d, delta: Math.round((e.clientX - d.x0) / px) } : d));
    // geste interrompu (défilement du navigateur, menu contextuel) : on abandonne sans rien enregistrer
    const cancel = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) setDrag(null);
    };
    const up = async (e: PointerEvent) => {
      const d = dragRef.current;
      if (d && e.pointerId !== d.pointerId) return;
      setDrag(null);
      if (!d) return;
      const c = list.find((x) => x.id === d.id);
      if (!c) return;
      if (!d.delta) return onOpen(c); // simple clic : ouvre la carte
      const nb = preview(d.bar, { ...d });
      const data = d.bar.milestone ? { dueDate: nb.end } : { startDate: nb.start, dueDate: nb.end };
      try {
        await api(`${acc.base}/e/card/${c.id}`, { method: "PATCH", json: data });
        toast("success", d.bar.milestone ? `Échéance : ${frDate(nb.end)}` : `Planifiée du ${frDate(nb.start)} au ${frDate(nb.end)}`);
      } finally {
        onSaved();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("lostpointercapture", cancel, true);
    window.addEventListener("blur", () => setDrag(null), { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("lostpointercapture", cancel, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.x0]);

  if (!cards) return <Spinner />;

  // repères : mois, lundis, sprints
  const months: { x: number; label: string }[] = [];
  for (let m = new Date(range.a); m.getTime() < range.a + range.days * DAY; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const start = Math.max(m.getTime(), range.a);
    months.push({ x: ((start - range.a) / DAY) * px, label: new Date(start).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }) });
  }
  const mondays: number[] = [];
  for (let d = 0; d < range.days; d += 7) mondays.push(d);
  const sprintBands = sprints.filter((s) => s.startDate && s.endDate && (scope === "all" || s.state !== "DONE"));

  const lanes = [
    ...lanesAll.map((l) => ({ id: l.id as string | null, label: `${l.emoji} ${l.name}` })),
    ...(list.some((c) => !c.streamId || !lanesAll.some((l) => l.id === c.streamId)) ? [{ id: null, label: "Sans stream" }] : []),
  ];
  const laneCards = (id: string | null) =>
    list
      .filter((c) => (id ? c.streamId === id : !c.streamId || !lanesAll.some((l) => l.id === c.streamId)))
      .sort((x, y) => (bars.get(x.id)?.start ?? "9").localeCompare(bars.get(y.id)?.start ?? "9") || x.position - y.position);
  const xToday = xOf(today);
  const alertLevels = acc.byKind("ALERT_LEVEL");

  return (
    <div>
      {/* barre d'outils */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input !w-auto !py-1 text-sm" value={streamId} onChange={(e) => setStreamId(e.target.value)} aria-label="Stream">
          <option value="">Tous les streams</option>
          {lanesAll.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.name}
            </option>
          ))}
        </select>
        <select className="input !w-auto !py-1 text-sm" value={scope} onChange={(e) => setScope(e.target.value as "open" | "all")} aria-label="Sprints">
          <option value="open">Sprint en cours et à venir</option>
          <option value="all">Tous les sprints</option>
        </select>
        <button className={`btn btn-sm ${alertOnly ? "btn-primary" : ""}`} aria-pressed={alertOnly} onClick={() => setAlertOnly(!alertOnly)}>
          ⚠️ Vigilance ou alerte
        </button>
        <button className={`btn btn-sm ${hideDone ? "" : "btn-primary"}`} aria-pressed={!hideDone} onClick={() => setHideDone(!hideDone)}>
          ✅ Terminées
        </button>
        <div className="flex-1" />
        <div className="inline-flex rounded-lg border border-line-soft p-0.5">
          {(
            [
              ["week", "Semaines"],
              ["month", "Mois"],
            ] as const
          ).map(([z, l]) => (
            <button key={z} className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${zoom === z ? "bg-petrol text-white" : "text-ink-2 hover:bg-surface-2"}`} onClick={() => setZoom(z)} aria-pressed={zoom === z}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn btn-sm" onClick={scrollToday}>
          Aujourd'hui
        </button>
      </div>

      {/* légende */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <Legend color="var(--accent)" label="Sans alerte" />
        {alertLevels.map((o) => (
          <Legend key={o.id} color={tone[o.color]} label={o.label} />
        ))}
        <Legend color="var(--teal)" label="Terminée" faded />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm border border-dashed border-muted" />
          Dates du sprint
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rotate-45 bg-muted" />
          Échéance seule
        </span>
        {acc.canEdit && <span className="hidden md:inline">Glisser une barre pour la déplacer, ses bords pour changer les dates.</span>}
      </div>

      {!list.length ? (
        <Empty>Aucune carte à planifier avec ces filtres.</Empty>
      ) : (
        <div ref={scroller} className="overflow-x-auto rounded-xl border border-line-soft bg-surface/40" style={{ touchAction: drag ? "none" : "pan-x pan-y" }}>
          <div className="relative" style={{ width: left + W }}>
            {/* en-tête : mois, sprints, semaines */}
            <div className="sticky top-0 z-20 border-b border-line-soft bg-surface">
              <div className="relative h-6" style={{ marginLeft: left }}>
                {months.map((m) => (
                  <div key={m.x} className="absolute top-1 whitespace-nowrap border-l border-line-soft pl-1.5 text-[0.7rem] font-semibold capitalize text-ink-2" style={{ left: m.x }}>
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="relative h-6" style={{ marginLeft: left }}>
                {sprintBands.map((s) => {
                  const x = xOf(s.startDate!);
                  const w = xOf(addDays(s.endDate!, 1)) - x;
                  return (
                    <div
                      key={s.id}
                      className="absolute top-0.5 flex h-5 items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-[0.68rem] font-semibold"
                      style={{ left: x, width: Math.max(w - 2, 4), background: s.state === "CURRENT" ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--surface-2)", color: s.state === "CURRENT" ? "var(--text)" : "var(--muted)" }}
                      title={`${s.name} : ${frDate(s.startDate)} au ${frDate(s.endDate)}${s.clientMilestone ? `\nÉchéance ${acc.data.account.clientName} : ${s.clientMilestone}` : ""}`}
                    >
                      {s.name}
                    </div>
                  );
                })}
              </div>
              {zoom === "week" && (
                <div className="relative h-5" style={{ marginLeft: left }}>
                  {mondays.map((d) => (
                    <div key={d} className="absolute top-0.5 text-[0.62rem] text-muted" style={{ left: d * px + 3 }}>
                      {frDate(iso(range.a + d * DAY), false)}
                    </div>
                  ))}
                </div>
              )}
              <div className="sticky left-0 -mt-[52px] flex h-[52px] w-0 items-end" style={{ width: left }} aria-hidden>
                <div className="h-full w-full border-r border-line-soft bg-surface px-3 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted" style={{ paddingTop: zoom === "week" ? 32 : 26 }}>
                  Livrable
                </div>
              </div>
            </div>

            {/* repères verticaux : semaines et aujourd'hui */}
            <div className="pointer-events-none absolute bottom-0 top-0" style={{ left, width: W }} aria-hidden>
              {mondays.map((d) => (
                <div key={d} className="absolute bottom-0 top-0 border-l border-line-soft/60" style={{ left: d * px }} />
              ))}
              <div className="absolute bottom-0 top-0 z-10 w-0.5 bg-red/80" style={{ left: xToday }} />
              <div className="absolute top-0 z-10 -translate-x-1/2 rounded bg-red px-1 text-[0.6rem] font-semibold text-white" style={{ left: xToday }}>
                Aujourd'hui
              </div>
            </div>

            {/* couloirs et cartes */}
            {lanes.map((lane) => {
              const key = lane.id ?? "none";
              const rows = laneCards(lane.id);
              if (!rows.length) return null;
              const isCollapsed = collapsed[key] ?? false;
              const nAlert = rows.filter((c) => c.alertLevelId && !acc.isDone(c.statusId)).length;
              const nLate = rows.filter((c) => c.dueDate && c.dueDate < today && !acc.isDone(c.statusId)).length;
              return (
                <div key={key}>
                  <div className="flex h-8 items-center border-b border-line-soft/60 bg-surface-2/80" style={{ width: left + W }}>
                    <button className="sticky left-0 z-10 flex h-full max-w-[min(100vw,640px)] items-center gap-2 bg-surface-2 px-3 text-left" onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })} aria-expanded={!isCollapsed}>
                      <IconChevronDown className={`shrink-0 text-muted transition ${isCollapsed ? "-rotate-90" : ""}`} width={14} height={14} />
                      <span className="truncate font-display text-sm font-bold text-heading">{lane.label}</span>
                      <span className="whitespace-nowrap text-[0.7rem] text-muted">
                        {rows.length} carte(s){nAlert ? `, ${nAlert} en vigilance ou alerte` : ""}
                        {nLate ? `, ${nLate} en retard` : ""}
                      </span>
                    </button>
                  </div>
                  {!isCollapsed &&
                    rows.map((c) => {
                      const base = bars.get(c.id) ?? null;
                      const b = base && drag?.id === c.id ? preview(base, drag) : base;
                      const done = acc.isDone(c.statusId);
                      const lvl = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;
                      const color = done ? "var(--teal)" : lvl ? tone[lvl.color] : "var(--accent)";
                      const late = !done && !!c.dueDate && c.dueDate < today;
                      const owner = c.ownerId ? acc.ctc.get(c.ownerId)?.name : "";
                      const tip = [
                        `#${c.ref} ${c.title}`,
                        b ? (b.milestone ? `Échéance : ${frDate(b.end)}` : `Du ${frDate(b.start)} au ${frDate(b.end)}${b.implied ? " (dates du sprint pour les dates manquantes)" : ""}`) : "Non planifiée",
                        c.statusId ? `Statut : ${acc.opt.get(c.statusId)?.label}` : "",
                        lvl ? `${lvl.label}` : "",
                        owner ? `Porteur : ${owner}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n");
                      return (
                        <div key={c.id} className="flex h-[30px] items-center border-b border-line-soft/40 hover:bg-surface-2/40">
                          <button
                            className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 overflow-hidden border-r border-line-soft bg-surface px-3 text-left text-[0.8rem] text-ink hover:text-accent"
                            style={{ width: left }}
                            onClick={() => onOpen(c)}
                            title={tip}
                          >
                            {lvl && !done && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone[lvl.color] }} />}
                            <span className={`truncate ${done ? "text-muted line-through" : ""}`}>{c.title}</span>
                          </button>
                          <div className="relative h-full" style={{ width: W }}>
                            {!b ? (
                              <button className="absolute top-1.5 text-[0.7rem] italic text-muted hover:text-accent" style={{ left: Math.max(4, xToday + 6) }} onClick={() => onOpen(c)}>
                                non planifiée : renseigner les dates
                              </button>
                            ) : b.milestone ? (
                              <div
                                className={`absolute top-[8px] h-3.5 w-3.5 rotate-45 rounded-[2px] ${acc.canEdit ? "cursor-grab" : ""}`}
                                style={{ left: xOf(b.end) + px / 2 - 7, background: color, opacity: done ? 0.55 : 1, boxShadow: late ? "0 0 0 2px var(--red)" : undefined, touchAction: acc.canEdit ? "none" : undefined }}
                                title={tip}
                                onPointerDown={(e) => onPointerDown(e, c, base!, "move")}
                                onClick={() => !acc.canEdit && onOpen(c)}
                              />
                            ) : (
                              <div
                                className={`group absolute top-[7px] h-4 rounded-full ${acc.canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
                                style={{
                                  left: xOf(b.start) + 1,
                                  width: Math.max(xOf(addDays(b.end, 1)) - xOf(b.start) - 2, 6),
                                  background: b.implied ? `color-mix(in srgb, ${color} 35%, transparent)` : color,
                                  border: b.implied ? `1.5px dashed ${color}` : undefined,
                                  opacity: done ? 0.55 : 1,
                                  boxShadow: late ? "inset -4px 0 0 var(--red)" : undefined,
                                  touchAction: acc.canEdit ? "none" : undefined,
                                }}
                                title={tip}
                                onPointerDown={(e) => onPointerDown(e, c, base!, "move")}
                                onClick={() => !acc.canEdit && onOpen(c)}
                              >
                                {acc.canEdit && (
                                  <>
                                    <span className="absolute -left-1 top-0 h-full w-2.5 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, c, base!, "start")} />
                                    <span className="absolute -right-1 top-0 h-full w-2.5 cursor-ew-resize" onPointerDown={(e) => onPointerDown(e, c, base!, "end")} />
                                  </>
                                )}
                              </div>
                            )}
                            {b && drag?.id === c.id && (
                              <div className="absolute -top-1 z-30 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[0.65rem] font-semibold text-bg" style={{ left: xOf(b.start) }}>
                                {b.milestone ? frDate(b.end) : `${frDate(b.start, false)} au ${frDate(b.end, false)}`}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label, faded }: { color: string; label: string; faded?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-5 rounded-full" style={{ background: color, opacity: faded ? 0.55 : 1 }} />
      {label}
    </span>
  );
}
