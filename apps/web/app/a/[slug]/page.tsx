"use client";

import useSWR from "swr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import { api, fetcher } from "@/lib/api";
import { frDate, isOverdue, tone } from "@/lib/format";
import type { Card, Meeting } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { CardModal } from "@/components/CardModal";
import { Markdown } from "@/components/Markdown";
import { Callout, Disclosure, Empty, Field, Modal, OptionSelect, Pill, SectionTitle, Spinner } from "@/components/ui";
import { IconChevronDown, IconComment, IconPlus } from "@/components/icons";

export default function KanbanPage() {
  const acc = useAcc();
  const { data: cards, mutate } = useSWR<Card[]>(`${acc.base}/cards`, fetcher);
  const [open, setOpen] = useState<Card | null>(null);

  const onChanged = (c?: Card, removed?: boolean) => {
    if (!c) return mutate();
    mutate((list) => (removed ? (list ?? []).filter((x) => x.id !== c.id) : (list ?? []).map((x) => (x.id === c.id ? { ...x, ...c } : x))), { revalidate: false });
  };

  return (
    <div className="space-y-8">
      <Callout text={acc.data.account.settings.intro} icon="🧭" />
      <LatestHighlights />
      <AlertCards cards={cards} onOpen={setOpen} />
      <Kanban cards={cards} mutate={mutate} onOpen={setOpen} />
      <Disclosure title="Mode d'emploi">
        <Markdown text={acc.data.account.settings.kanbanGuide} />
      </Disclosure>
      <CardModal card={open} onClose={() => setOpen(null)} onChanged={onChanged} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Derniers faits marquants
// ---------------------------------------------------------------------------
function LatestHighlights() {
  const acc = useAcc();
  const type = acc.data.meetingTypes.find((m) => m.active && m.blocks.includes("HIGHLIGHTS"));
  const { data } = useSWR<Meeting[]>(type ? `${acc.base}/meetings?typeId=${type.id}` : null, fetcher);
  if (!type) return null;
  const last = data?.[0];
  return (
    <section>
      <SectionTitle
        icon="📰"
        actions={
          <Link href={`/a/${acc.data.account.slug}/meetings/${type.id}`} className="btn btn-sm">
            Toutes les séances
          </Link>
        }
      >
        Derniers faits marquants{last ? ` (${type.name} du ${frDate(last.date)})` : ""}
      </SectionTitle>
      {!data ? (
        <Spinner />
      ) : !last || !last.highlights.length ? (
        <Empty>Aucun fait marquant pour l'instant.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {last.highlights.map((h) => {
            const t = h.typeId ? acc.opt.get(h.typeId) : null;
            const s = h.streamId ? acc.str.get(h.streamId) : null;
            return (
              <article key={h.id} className="card p-4">
                <div className="mb-1 flex items-start gap-2">
                  <h3 className="flex-1 font-display text-base font-bold leading-snug text-accent">
                    {h.emoji && <span className="mr-1">{h.emoji}</span>}
                    {h.title}
                  </h3>
                  {t && <Pill option={t} small />}
                </div>
                {s && (
                  <div className="mb-2 text-xs font-semibold text-ocre">
                    {s.emoji} {s.name}
                  </div>
                )}
                <Markdown text={h.detail} className="text-sm text-ink-2" />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cartes en vigilance ou en alerte
// ---------------------------------------------------------------------------
function AlertCards({ cards, onOpen }: { cards?: Card[]; onOpen: (c: Card) => void }) {
  const acc = useAcc();
  const list = useMemo(
    () =>
      (cards ?? [])
        .filter((c) => c.alertLevelId && !acc.isDone(c.statusId))
        .sort((a, b) => (acc.opt.get(b.alertLevelId!)?.order ?? 0) - (acc.opt.get(a.alertLevelId!)?.order ?? 0) || (acc.str.get(a.streamId ?? "")?.order ?? 0) - (acc.str.get(b.streamId ?? "")?.order ?? 0)),
    [cards, acc],
  );
  return (
    <section>
      <SectionTitle icon="🚨">Cartes en vigilance ou en alerte</SectionTitle>
      {!cards ? (
        <Spinner />
      ) : !list.length ? (
        <Empty>Aucune carte en vigilance ou en alerte.</Empty>
      ) : (
        <>
          {/* tableau (écran large) */}
          <div className="table-wrap hidden md:block">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-[26%]">Livrable</th>
                  <th>Niveau</th>
                  <th>Stream</th>
                  <th>Porteur</th>
                  <th>Échéance</th>
                  <th className="w-[38%]">Alertes / arbitrages</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const lvl = acc.opt.get(c.alertLevelId!);
                  const s = c.streamId ? acc.str.get(c.streamId) : null;
                  return (
                    <tr key={c.id} className="cursor-pointer" onClick={() => onOpen(c)} style={{ boxShadow: `inset 3px 0 0 ${tone[lvl?.color ?? "slate"]}` }}>
                      <td className="font-semibold text-ink">{c.title}</td>
                      <td>
                        <Pill option={lvl} small />
                      </td>
                      <td className="whitespace-nowrap">{s ? `${s.emoji} ${s.name}` : ""}</td>
                      <td className="whitespace-nowrap">{c.ownerId ? acc.ctc.get(c.ownerId)?.name : ""}</td>
                      <td className={`whitespace-nowrap ${isOverdue(c.dueDate) ? "font-semibold text-red" : ""}`}>{frDate(c.dueDate)}</td>
                      <td>
                        <Markdown text={c.alertsNote} className="line-clamp-4 text-[0.82rem]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* cartes (mobile) */}
          <div className="space-y-2 md:hidden">
            {list.map((c) => {
              const lvl = acc.opt.get(c.alertLevelId!);
              return (
                <button key={c.id} onClick={() => onOpen(c)} className="card block w-full p-3 text-left" style={{ borderLeft: `3px solid ${tone[lvl?.color ?? "slate"]}` }}>
                  <div className="flex items-start gap-2">
                    <span className="flex-1 font-semibold text-ink">{c.title}</span>
                    <Pill option={lvl} small />
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {[c.streamId ? acc.str.get(c.streamId)?.name : "", c.ownerId ? acc.ctc.get(c.ownerId)?.name : "", c.dueDate ? `échéance ${frDate(c.dueDate)}` : ""].filter(Boolean).join(", ")}
                  </div>
                  <Markdown text={c.alertsNote} className="mt-1 line-clamp-3 text-sm text-ink-2" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Kanban du sprint : colonnes = statuts, couloirs = streams
// ---------------------------------------------------------------------------
function Kanban({ cards, mutate, onOpen }: { cards?: Card[]; mutate: ReturnType<typeof useSWR<Card[]>>["mutate"]; onOpen: (c: Card) => void }) {
  const acc = useAcc();
  const statuses = acc.byKind("CARD_STATUS");
  const lanes = acc.data.streams.filter((s) => s.active && s.inKanban).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const [sprintId, setSprintId] = useState(acc.currentSprint?.id ?? "");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [alertOnly, setAlertOnly] = useState(false);
  const [mobileStatus, setMobileStatus] = useState(statuses[1]?.id ?? statuses[0]?.id ?? "");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState<{ streamId: string | null; statusId: string | null } | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const isMobile = useIsMobile();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cards ?? []).filter(
      (c) =>
        (!sprintId || c.sprintId === sprintId) &&
        (!owner || c.ownerId === owner) &&
        (!alertOnly || c.alertLevelId) &&
        (!q || c.title.toLowerCase().includes(q) || String(c.ref) === q),
    );
  }, [cards, sprintId, owner, alertOnly, query]);

  const cellCards = (streamId: string | null, statusId: string) =>
    visible.filter((c) => (c.streamId ?? null) === streamId && (c.statusId ?? statuses[0]?.id) === statusId).sort((a, b) => a.position - b.position);
  const orphans = visible.filter((c) => !c.streamId || !lanes.some((l) => l.id === c.streamId));
  const sprint = sprintId ? acc.spr.get(sprintId) : null;

  const onDragStart = (e: DragStartEvent) => setDragging((cards ?? []).find((c) => c.id === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const card = (cards ?? []).find((c) => c.id === e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!card || !over) return;
    let streamId: string | null;
    let statusId: string;
    let beforeId: string | null = null;
    let afterId: string | null = null;
    if (over.startsWith("card:")) {
      const target = (cards ?? []).find((c) => c.id === over.slice(5));
      if (!target || target.id === card.id) return;
      streamId = target.streamId;
      statusId = target.statusId ?? statuses[0].id;
      const list = cellCards(streamId, statusId).filter((c) => c.id !== card.id);
      const idx = list.findIndex((c) => c.id === target.id);
      afterId = target.id; // on insère avant la carte survolée
      beforeId = idx > 0 ? list[idx - 1].id : null;
    } else {
      const [, s, st] = over.split(":");
      streamId = s === "none" ? null : s;
      statusId = st;
      const list = cellCards(streamId, statusId).filter((c) => c.id !== card.id);
      beforeId = list.length ? list[list.length - 1].id : null;
    }
    if (card.streamId === streamId && card.statusId === statusId && !afterId && beforeId === null) return;
    // mise à jour optimiste
    const b = beforeId ? (cards ?? []).find((c) => c.id === beforeId) : null;
    const a = afterId ? (cards ?? []).find((c) => c.id === afterId) : null;
    const position = b && a ? (b.position + a.position) / 2 : b ? b.position + 1 : a ? a.position - 1 : card.position;
    mutate((list) => (list ?? []).map((c) => (c.id === card.id ? { ...c, streamId, statusId, position } : c)), { revalidate: false });
    try {
      await api(`${acc.base}/cards/${card.id}/move`, { method: "POST", json: { streamId, statusId, beforeId, afterId } });
    } finally {
      mutate();
    }
  };

  const cell = (streamId: string | null, statusId: string) => (
    <Cell
      key={`${streamId}:${statusId}`}
      id={`cell:${streamId ?? "none"}:${statusId}`}
      cards={cellCards(streamId, statusId)}
      onOpen={onOpen}
      canEdit={acc.canEdit}
      onAdd={() => setCreating({ streamId, statusId })}
    />
  );

  return (
    <section>
      <SectionTitle
        icon="🗂️"
        actions={
          acc.canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating({ streamId: null, statusId: statuses[0]?.id ?? null })}>
              <IconPlus /> Nouvelle carte
            </button>
          )
        }
      >
        Kanban {sprint ? `du ${sprint.name}` : "de tous les sprints"}
      </SectionTitle>
      {sprint && (
        <p className="-mt-2 mb-3 text-xs text-muted">
          Du {frDate(sprint.startDate)} au {frDate(sprint.endDate)}
          {sprint.clientMilestone ? `. Échéance ${acc.data.account.clientName} : ${sprint.clientMilestone}` : ""}
        </p>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        <select className="input lg:w-52" value={sprintId} onChange={(e) => setSprintId(e.target.value)} aria-label="Sprint">
          <option value="">Tous les sprints</option>
          {acc.data.sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.state === "CURRENT" ? " (en cours)" : s.state === "DONE" ? " (terminé)" : ""}
            </option>
          ))}
        </select>
        <OptionSelect className="lg:w-52" options={acc.data.contacts.map((c) => ({ id: c.id, label: c.name }))} value={owner} onChange={setOwner} placeholder="Tous les porteurs" />
        <input className="input lg:w-64" placeholder="Rechercher une carte ou une réf." value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={alertOnly} onChange={(e) => setAlertOnly(e.target.checked)} /> Vigilance ou alerte uniquement
        </label>
      </div>

      {!cards ? (
        <Spinner />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          {/* sélecteur de colonne (mobile) */}
          <div className="mb-3 flex gap-1 overflow-x-auto md:hidden">
            {statuses.map((s) => (
              <button key={s.id} className={`btn btn-sm shrink-0 ${mobileStatus === s.id ? "btn-primary" : ""}`} onClick={() => setMobileStatus(s.id)}>
                {s.label} <span className="opacity-70">{visible.filter((c) => (c.statusId ?? statuses[0].id) === s.id).length}</span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <div className="md:min-w-[900px]">
              {/* en-têtes de colonnes */}
              <div className="mb-1 hidden gap-3 py-2 md:grid" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(0, 1fr))` }}>
                {statuses.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone[s.color] }} />
                    {s.label}
                    <span className="ml-auto text-xs text-muted">{visible.filter((c) => (c.statusId ?? statuses[0].id) === s.id).length}</span>
                  </div>
                ))}
              </div>

              {[...lanes.map((l) => ({ id: l.id as string | null, label: `${l.emoji} ${l.name}`, leader: l.leader })), ...(orphans.length ? [{ id: null, label: "Sans stream", leader: "" }] : [])].map((lane) => {
                const count = visible.filter((c) => (lane.id ? c.streamId === lane.id : !c.streamId || !lanes.some((l) => l.id === c.streamId))).length;
                const key = lane.id ?? "none";
                const isCollapsed = collapsed[key] ?? false;
                return (
                  <div key={key} className="mb-3">
                    <button className="mb-2 flex w-full items-center gap-2 text-left" onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })}>
                      <IconChevronDown className={`text-muted transition ${isCollapsed ? "-rotate-90" : ""}`} />
                      <span className="font-display text-base font-bold text-heading">{lane.label}</span>
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{count}</span>
                      {lane.leader && <span className="hidden truncate text-xs text-muted sm:inline">{lane.leader}</span>}
                    </button>
                    {!isCollapsed &&
                      (isMobile ? (
                        <div>{cell(lane.id, mobileStatus)}</div>
                      ) : (
                        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${statuses.length}, minmax(0, 1fr))` }}>
                          {statuses.map((s) => cell(lane.id, s.id))}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
          <DragOverlay>{dragging ? <CardTile card={dragging} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      <NewCardModal init={creating} sprintId={sprintId || acc.currentSprint?.id || null} onClose={() => setCreating(null)} onCreated={(c) => (mutate(), onOpen(c))} />
    </section>
  );
}

function Cell({ id, cards, onOpen, canEdit, onAdd }: { id: string; cards: Card[]; onOpen: (c: Card) => void; canEdit: boolean; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canEdit });
  return (
    <div
      ref={setNodeRef}
      className={`group flex min-h-[64px] flex-col gap-2 rounded-xl border p-2 transition ${isOver ? "border-accent bg-accent/10" : "border-line-soft bg-surface/40"}`}
    >
      {cards.map((c) => (
        <DraggableCard key={c.id} card={c} onOpen={onOpen} canEdit={canEdit} />
      ))}
      {canEdit && (
        <button className="rounded-lg py-1 text-xs text-muted opacity-60 transition hover:bg-surface-2 hover:text-ink group-hover:opacity-100" onClick={onAdd}>
          + Ajouter
        </button>
      )}
    </div>
  );
}

function DraggableCard({ card, onOpen, canEdit }: { card: Card; onOpen: (c: Card) => void; canEdit: boolean }) {
  const drag = useDraggable({ id: card.id, disabled: !canEdit });
  const drop = useDroppable({ id: `card:${card.id}`, disabled: !canEdit });
  return (
    <div
      ref={(n) => {
        drag.setNodeRef(n);
        drop.setNodeRef(n);
      }}
      {...drag.listeners}
      {...drag.attributes}
      className={`${drag.isDragging ? "opacity-30" : ""} ${drop.isOver && !drag.isDragging ? "pt-3" : ""} transition-[padding]`}
      onClick={() => onOpen(card)}
    >
      <CardTile card={card} />
    </div>
  );
}

function CardTile({ card, overlay = false }: { card: Card; overlay?: boolean }) {
  const acc = useAcc();
  const lvl = card.alertLevelId ? acc.opt.get(card.alertLevelId) : null;
  const owner = card.ownerId ? acc.ctc.get(card.ownerId)?.name : "";
  return (
    <div
      className={`cursor-pointer rounded-lg border bg-surface p-2.5 text-left shadow-sm transition hover:border-accent ${overlay ? "rotate-2 shadow-2xl" : ""}`}
      style={{ borderColor: lvl ? `color-mix(in srgb, ${tone[lvl.color]} 55%, transparent)` : "var(--border-soft)", borderLeftWidth: lvl ? 3 : 1, borderLeftColor: lvl ? tone[lvl.color] : undefined }}
    >
      <div className="flex items-start gap-1.5">
        <span className="flex-1 text-[0.86rem] font-semibold leading-snug text-ink">
          {card.emoji && <span className="mr-1">{card.emoji}</span>}
          {card.title}
        </span>
        {lvl && <span title={lvl.label}>{lvl.emoji || "●"}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-muted">
        {owner && <span className="truncate">{owner}</span>}
        {card.dueDate && <span className={isOverdue(card.dueDate) && !acc.isDone(card.statusId) ? "font-semibold text-red" : ""}>{frDate(card.dueDate, false)}</span>}
        {!!card.commentCount && (
          <span className="inline-flex items-center gap-0.5">
            <IconComment width={12} height={12} />
            {card.commentCount}
          </span>
        )}
        <span className="ml-auto opacity-60">#{card.ref}</span>
      </div>
      {card.progressPct !== null && card.progressPct !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded bg-surface-3">
          <div className="h-full bg-accent" style={{ width: `${card.progressPct}%` }} />
        </div>
      )}
    </div>
  );
}

function NewCardModal({ init, sprintId, onClose, onCreated }: { init: { streamId: string | null; statusId: string | null } | null; sprintId: string | null; onClose: () => void; onCreated: (c: Card) => void }) {
  const acc = useAcc();
  const [title, setTitle] = useState("");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [sprint, setSprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = init ? `${init.streamId}-${init.statusId}` : "";
  const [lastKey, setLastKey] = useState("");
  if (init && key !== lastKey) {
    setLastKey(key);
    setStreamId(init.streamId);
    setStatusId(init.statusId);
    setSprint(sprintId);
    setTitle("");
  }
  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const c = await api<Card>(`${acc.base}/e/card`, { method: "POST", json: { title: title.trim(), streamId, statusId, sprintId: sprint } });
      onClose();
      setLastKey("");
      onCreated(c);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!init}
      onClose={() => (onClose(), setLastKey(""))}
      title="Nouvelle carte"
      footer={
        <>
          <button className="btn" onClick={() => (onClose(), setLastKey(""))}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={create}>
            Créer la carte
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Titre du livrable">
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Stream">
            <OptionSelect options={acc.data.streams.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }))} value={streamId} onChange={setStreamId} />
          </Field>
          <Field label="Statut">
            <OptionSelect options={acc.byKind("CARD_STATUS")} value={statusId} onChange={setStatusId} />
          </Field>
          <Field label="Sprint">
            <OptionSelect options={acc.data.sprints.map((s) => ({ id: s.id, label: s.name }))} value={sprint} onChange={setSprint} />
          </Field>
        </div>
        <p className="text-xs text-muted">Les autres champs se renseignent ensuite dans la carte.</p>
      </div>
    </Modal>
  );
}

/** Une seule version du kanban est rendue (desktop ou mobile) pour éviter des zones de dépôt en double. */
function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 767px)");
    const on = () => setM(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return m;
}
