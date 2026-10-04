"use client";

import useSWR from "swr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, DragOverlay, type DragStartEvent } from "@dnd-kit/core";
import { api, fetcher } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { frDate, isOverdue, tone } from "@/lib/format";
import type { Card, Option, Sprint, Stream } from "@/lib/types";
import { useAcc, useEditMode } from "@/components/AccountContext";
import { CardModal } from "@/components/CardModal";
import { Markdown } from "@/components/Markdown";
import { FreshnessModal, FreshnessTag, useFreshness } from "@/components/Freshness";
import { daysSince } from "@/lib/freshness";
import { AddButton, Menu, OptionModal, SprintModal, StreamModal, swapOrder, useSprintSwitch, type MenuItem } from "@/components/config";
import { Disclosure, Empty, Field, Modal, OptionSelect, Pill, Spinner } from "@/components/ui";
import { IconChevronDown, IconComment, IconPlus } from "@/components/icons";

type View = "status" | "sprints";
type Col = { id: string; label: ReactNode; color?: string; menu?: MenuItem[]; hint?: string };
type Lane = { id: string | null; label: string; leader: string; stream?: Stream };

/**
 * Onglet Kanban : le kanban du sprint en cours (colonnes = statuts, couloirs = streams)
 * et la planification des sprints suivants (colonnes = sprints, couloirs = streams).
 * Sprints, colonnes et streams se créent et se modifient depuis l'écran (administrateurs).
 */
export default function KanbanPage() {
  const acc = useAcc();
  const { data: cards, mutate } = useSWR<Card[]>(`${acc.base}/cards`, fetcher);
  const [open, setOpen] = useState<Card | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const linked = params.get("card");

  // lien direct vers une carte (recherche, tableau de bord) : ouverte une seule fois, puis le lien est retiré de l'adresse
  useEffect(() => {
    if (!linked || !cards) return;
    const c = cards.find((x) => x.id === linked);
    if (c) setOpen(c);
    else api<Card>(`${acc.base}/e/card/${linked}`, { silent: true }).then(setOpen, () => undefined);
    router.replace(pathname, { scroll: false });
  }, [linked, cards, acc.base, router, pathname]);

  const onChanged = (c?: Card, removed?: boolean) => {
    if (!c) return mutate();
    // une carte archivée quitte le tableau comme une carte supprimée
    const gone = removed || c.archived;
    mutate((list) => (gone ? (list ?? []).filter((x) => x.id !== c.id) : (list ?? []).map((x) => (x.id === c.id ? { ...x, ...c } : x))), { revalidate: false });
  };

  return (
    <div className="space-y-6">
      <Board cards={cards} mutate={mutate} onOpen={setOpen} />
      <Disclosure title="Mode d'emploi">
        <Markdown text={acc.data.account.settings.kanbanGuide} />
        <p className="mt-3 text-xs text-muted">
          Vue « Par statut » : le kanban d'un sprint. Vue « Par sprint » : glissez une carte d'un sprint à l'autre pour la replanifier. Administrateurs : activez le « Mode édition » (en haut) pour créer un sprint, une colonne ou un stream (« + ») et les modifier (« ⋯ » sur un en-tête).
        </p>
      </Disclosure>
      <CardModal card={open} onClose={() => setOpen(null)} onChanged={onChanged} onDuplicated={(c) => (mutate(), setOpen(c))} />
    </div>
  );
}

function Board({ cards, mutate, onOpen }: { cards?: Card[]; mutate: ReturnType<typeof useSWR<Card[]>>["mutate"]; onOpen: (c: Card) => void }) {
  const acc = useAcc();
  // boutons de structure (sprints, colonnes, streams) : visibles en mode édition seulement
  const admin = useEditMode();
  const statuses = acc.byKind("CARD_STATUS");
  const sprints = useMemo(() => [...acc.data.sprints].sort((a, b) => a.order - b.order), [acc.data.sprints]);
  const openSprints = sprints.filter((s) => s.state !== "DONE");
  const doneSprints = sprints.filter((s) => s.state === "DONE");
  const lanesAll = acc.data.streams.filter((s) => s.active && s.inKanban).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const [view, setView] = useState<View>("status");
  const [sprintId, setSprintId] = useState<string>(acc.currentSprint?.id ?? "");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const [alertOnly, setAlertOnly] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const [freshOpen, setFreshOpen] = useState(false);
  const fresh = useFreshness();
  const staleAfter = fresh.levels.length > 1 ? fresh.levels[0].maxDays : null;
  const [showDone, setShowDone] = useState(false);
  const [mobileCol, setMobileCol] = useState<Record<View, string>>({ status: statuses[1]?.id ?? statuses[0]?.id ?? "", sprints: acc.currentSprint?.id ?? "none" });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState<{ streamId: string | null; statusId: string | null; sprintId: string | null } | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [sprintEdit, setSprintEdit] = useState<Sprint | "new" | null>(null);
  const [streamEdit, setStreamEdit] = useState<Stream | "new" | null>(null);
  const [colEdit, setColEdit] = useState<Option | "new" | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sw = useSprintSwitch();
  const router = useRouter();
  const isMobile = useIsMobile();
  // souris : déplacement après 6 px ; écran tactile : appui long (le défilement de la page reste possible)
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }));
  const { data: me } = useMe();
  const myContacts = useMemo(() => new Set(acc.data.contacts.filter((c) => c.userId && c.userId === me?.user.id).map((c) => c.id)), [acc.data.contacts, me]);

  // sprint retenu toujours valide (création, suppression)
  useEffect(() => {
    if (sprintId && sprintId !== "none" && !acc.spr.get(sprintId)) setSprintId(acc.currentSprint?.id ?? "");
  }, [sprintId, acc]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return (cards ?? []).filter(
      (c) =>
        !c.archived &&
        (!owner || c.ownerId === owner) &&
        (!alertOnly || c.alertLevelId) &&
        (!lateOnly || (isOverdue(c.dueDate) && !acc.isDone(c.statusId))) &&
        (!mineOnly || (c.ownerId && myContacts.has(c.ownerId))) &&
        (!staleOnly || staleAfter === null || ((daysSince(c.contentUpdatedAt ?? c.updatedAt) ?? 0) > staleAfter && !acc.isDone(c.statusId))) &&
        (!q || c.title.toLowerCase().includes(q) || String(c.ref) === q),
    );
  }, [cards, owner, alertOnly, lateOnly, mineOnly, staleOnly, staleAfter, myContacts, query, acc]);

  // ---------------------------------------------------------------- colonnes, couloirs et rangement des cartes
  const inScope = (c: Card) =>
    view === "status"
      ? !sprintId || (sprintId === "none" ? !c.sprintId : c.sprintId === sprintId)
      : (!c.sprintId || openSprints.some((s) => s.id === c.sprintId)) && (showDone || !acc.isDone(c.statusId));
  const scoped = visible.filter(inScope);

  const reorderOpt = async (i: number, dir: -1 | 1) => {
    await swapOrder(acc.base, "option", statuses.map((s) => s.id), i, dir);
    acc.mutate();
  };

  const cols: Col[] =
    view === "status"
      ? statuses.map((s, i) => ({
          id: s.id,
          label: s.label,
          color: tone[s.color],
          menu: admin
            ? [
                { label: "Modifier la colonne", onClick: () => setColEdit(s) },
                { label: "Déplacer à gauche", disabled: i === 0, onClick: () => reorderOpt(i, -1) },
                { label: "Déplacer à droite", disabled: i === statuses.length - 1, onClick: () => reorderOpt(i, 1) },
              ]
            : undefined,
        }))
      : [
          ...openSprints.map((s) => ({
            id: s.id,
            label: (
              <span className="truncate">
                {s.name}
                {s.state === "CURRENT" && <span className="ml-1 text-[0.68rem] font-normal text-accent">en cours</span>}
              </span>
            ),
            hint: s.startDate ? `${frDate(s.startDate, false)} au ${frDate(s.endDate, false)}` : "",
            color: s.state === "CURRENT" ? "var(--accent)" : "var(--slate)",
            menu: admin
              ? [
                  { label: "Bilan du sprint", onClick: () => router.push(`/a/${acc.data.account.slug}/sprints/${s.id}`) },
                  { label: "Modifier le sprint", onClick: () => setSprintEdit(s) },
                  ...(s.state === "CURRENT" && sw.possible ? [{ label: "Basculer au sprint suivant", onClick: sw.ask }] : []),
                ]
              : undefined,
          })),
          { id: "none", label: "Non planifiées", color: "var(--muted)" },
        ];
  const colOf = (c: Card) => (view === "status" ? c.statusId ?? statuses[0]?.id : c.sprintId ?? "none");
  const laneOf = (c: Card) => (c.streamId && lanesAll.some((l) => l.id === c.streamId) ? c.streamId : null);
  const lanes: Lane[] = [
    ...lanesAll.map((l) => ({ id: l.id as string | null, label: `${l.emoji} ${l.name}`, leader: l.leader, stream: l })),
    ...(scoped.some((c) => laneOf(c) === null) ? [{ id: null, label: "Sans stream", leader: "" }] : []),
  ];
  const cellCards = (laneId: string | null, colId: string) => scoped.filter((c) => laneOf(c) === laneId && colOf(c) === colId).sort((a, b) => a.position - b.position);

  const laneMenu = (l: Lane): MenuItem[] => {
    if (!admin || !l.stream) return [];
    const i = lanesAll.findIndex((x) => x.id === l.id);
    // échange avec le couloir visible voisin : les streams masqués gardent leur place derrière
    const visible = lanesAll.map((s) => s.id);
    const hidden = [...acc.data.streams].filter((s) => !visible.includes(s.id)).sort((a, b) => a.order - b.order).map((s) => s.id);
    const ids = [...visible, ...hidden];
    return [
      { label: "Modifier le stream", onClick: () => setStreamEdit(l.stream!) },
      { label: "Monter", disabled: i <= 0, onClick: async () => (await swapOrder(acc.base, "stream", ids, i, -1), acc.mutate()) },
      { label: "Descendre", disabled: i >= lanesAll.length - 1, onClick: async () => (await swapOrder(acc.base, "stream", ids, i, 1), acc.mutate()) },
      "sep",
      { label: "Retirer du kanban", onClick: async () => (await api(`${acc.base}/e/stream/${l.stream!.id}`, { method: "PATCH", json: { inKanban: false } }), acc.mutate()) },
    ];
  };

  // ---------------------------------------------------------------- glisser-déposer
  const onDragStart = (e: DragStartEvent) => setDragging((cards ?? []).find((c) => c.id === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const card = (cards ?? []).find((c) => c.id === e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!card || !over) return;
    let laneId: string | null;
    let colId: string;
    let beforeId: string | null = null;
    let afterId: string | null = null;
    if (over.startsWith("card|")) {
      const target = (cards ?? []).find((c) => c.id === over.slice(5));
      if (!target || target.id === card.id) return;
      laneId = laneOf(target);
      colId = colOf(target)!;
      const list = cellCards(laneId, colId).filter((c) => c.id !== card.id);
      const idx = list.findIndex((c) => c.id === target.id);
      afterId = target.id;
      beforeId = idx > 0 ? list[idx - 1].id : null;
    } else {
      const [, l, c] = over.split("|");
      laneId = l === "none" ? null : l;
      colId = c;
      const list = cellCards(laneId, colId).filter((x) => x.id !== card.id);
      beforeId = list.length ? list[list.length - 1].id : null;
    }
    if (laneOf(card) === laneId && colOf(card) === colId && !afterId && beforeId === null) return;
    const b = beforeId ? (cards ?? []).find((c) => c.id === beforeId) : null;
    const a = afterId ? (cards ?? []).find((c) => c.id === afterId) : null;
    const position = b && a ? (b.position + a.position) / 2 : b ? b.position + 1 : a ? a.position - 1 : card.position;
    // couloir « Sans stream » : une carte d'un stream masqué garde son stream
    const streamId = laneId ?? (laneOf(card) === null ? card.streamId : null);
    const patch = view === "status" ? { streamId, statusId: colId } : { streamId, sprintId: colId === "none" ? null : colId };
    mutate((list) => (list ?? []).map((c) => (c.id === card.id ? { ...c, ...patch, position } : c)), { revalidate: false });
    try {
      if (view === "status") await api(`${acc.base}/cards/${card.id}/move`, { method: "POST", json: { streamId, statusId: colId, beforeId, afterId } });
      else await api(`${acc.base}/e/card/${card.id}`, { method: "PATCH", json: { ...patch, position } });
    } finally {
      mutate();
    }
  };

  const sprint = view === "status" && sprintId && sprintId !== "none" ? acc.spr.get(sprintId) : null;
  const sprintCards = (cards ?? []).filter((c) => sprint && c.sprintId === sprint.id);
  const doneCount = sprintCards.filter((c) => acc.isDone(c.statusId)).length;
  const donePct = sprintCards.length ? Math.round((doneCount / sprintCards.length) * 100) : 0;
  const activeFilters = [owner, alertOnly, lateOnly, mineOnly, staleOnly, query.trim()].filter(Boolean).length;
  const mobileColId = cols.some((c) => c.id === mobileCol[view]) ? mobileCol[view] : cols[0]?.id;

  // sprint proposé à la création : celui de l'onglet affiché (« Sans sprint » : aucun ; « Tous » : le sprint en cours)
  const defaultSprint = sprintId === "none" ? null : (sprint?.id ?? acc.currentSprint?.id ?? null);
  const addAt = (laneId: string | null, colId: string) => {
    if (view === "status") setCreating({ streamId: laneId, statusId: colId, sprintId: defaultSprint });
    else setCreating({ streamId: laneId, statusId: statuses[0]?.id ?? null, sprintId: colId === "none" ? null : colId });
  };

  return (
    <section>
      {/* en-tête : vue, filtres, nouvelle carte */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line-soft p-0.5" role="tablist" aria-label="Vue du kanban">
          {(
            [
              ["status", "Par statut"],
              ["sprints", "Par sprint"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={view === v} className={`rounded-md px-3 py-1 text-sm font-semibold transition ${view === v ? "bg-petrol text-white" : "text-ink-2 hover:bg-surface-2"}`} onClick={() => setView(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {admin && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFreshOpen(true)} title="Paliers de l'étiquette « jours depuis la dernière modification »">
            🕒 Fraîcheur
          </button>
        )}
        <button className={`btn btn-sm ${activeFilters ? "btn-primary" : ""}`} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>
          Filtres{activeFilters ? ` (${activeFilters})` : ""}
        </button>
        {acc.canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating({ streamId: null, statusId: statuses[0]?.id ?? null, sprintId: view === "status" ? defaultSprint : (acc.currentSprint?.id ?? null) })}>
            <IconPlus /> Nouvelle carte
          </button>
        )}
      </div>

      {view === "status" && (
        <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1">
          {openSprints.map((s) => (
            <SprintTab key={s.id} active={sprintId === s.id} onClick={() => setSprintId(s.id)}>
              {s.name}
              {s.state === "CURRENT" && <span className="ml-1 text-[0.68rem] opacity-80">en cours</span>}
            </SprintTab>
          ))}
          <SprintTab active={sprintId === "none"} onClick={() => setSprintId("none")}>
            Sans sprint
          </SprintTab>
          <SprintTab active={!sprintId} onClick={() => setSprintId("")}>
            Tous
          </SprintTab>
          {doneSprints.length > 0 && (
            <select
              className="input !w-auto shrink-0 !py-1 text-xs"
              value={doneSprints.some((s) => s.id === sprintId) ? sprintId : ""}
              onChange={(e) => e.target.value && setSprintId(e.target.value)}
              aria-label="Sprints terminés"
            >
              <option value="">Terminés…</option>
              {doneSprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {admin && (
            <AddButton label="Créer un sprint" onClick={() => setSprintEdit("new")}>
              Sprint
            </AddButton>
          )}
          {sprint && (
            <Menu
              label={`Options du ${sprint.name}`}
              items={[
                { label: `Bilan du ${sprint.name}`, onClick: () => router.push(`/a/${acc.data.account.slug}/sprints/${sprint.id}`) },
                ...(admin
                  ? [
                      "sep" as const,
                      { label: "Modifier le sprint", onClick: () => setSprintEdit(sprint) },
                      ...(sprint.state === "CURRENT" && sw.possible ? [{ label: `Basculer au ${sw.next?.name}`, onClick: sw.ask }] : []),
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      )}

      {sprint && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            Du {frDate(sprint.startDate)} au {frDate(sprint.endDate)}
          </span>
          {sprint.clientMilestone && (
            <span className="max-w-full truncate" title={sprint.clientMilestone}>
              Échéance {acc.data.account.clientShortName || acc.data.account.clientName} : {sprint.clientMilestone.split("\n")[0]}
            </span>
          )}
          {sprintCards.length > 0 && (
            <span className="flex items-center gap-2" title={`${doneCount} carte(s) terminée(s) sur ${sprintCards.length}`}>
              <span className="h-1.5 w-32 overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-teal" style={{ width: `${donePct}%` }} />
              </span>
              {doneCount}/{sprintCards.length} terminées ({donePct} %)
            </span>
          )}
        </div>
      )}
      {view === "sprints" && <p className="mb-3 text-xs text-muted">Sprint en cours et sprints suivants, par stream. Glissez une carte vers un autre sprint pour la replanifier.</p>}

      {filtersOpen && (
        <div className="mb-4 grid gap-2 rounded-xl border border-line-soft p-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
          <OptionSelect className="lg:w-52" options={acc.data.contacts.map((c) => ({ id: c.id, label: c.name }))} value={owner} onChange={setOwner} placeholder="Tous les porteurs" />
          <input className="input lg:w-64" placeholder="Filtrer par titre ou réf." value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex flex-wrap gap-1.5 sm:col-span-2 lg:col-span-1">
            <FilterChip active={alertOnly} onClick={() => setAlertOnly(!alertOnly)}>
              ⚠️ Vigilance ou alerte
            </FilterChip>
            <FilterChip active={lateOnly} onClick={() => setLateOnly(!lateOnly)}>
              ⏰ En retard
            </FilterChip>
            {fresh.enabled && staleAfter !== null && (
              <FilterChip active={staleOnly} onClick={() => setStaleOnly(!staleOnly)}>
                💤 Sans mise à jour depuis plus de {staleAfter} j
              </FilterChip>
            )}
            {myContacts.size > 0 && (
              <FilterChip active={mineOnly} onClick={() => setMineOnly(!mineOnly)}>
                🙋 Mes cartes
              </FilterChip>
            )}
            {view === "sprints" && (
              <FilterChip active={showDone} onClick={() => setShowDone(!showDone)}>
                ✅ Afficher les terminées
              </FilterChip>
            )}
          </div>
        </div>
      )}

      {!cards ? (
        <Spinner />
      ) : !statuses.length ? (
        <Empty>Aucune colonne : {admin ? "créez la première avec le bouton ci-dessous." : "un administrateur doit définir les colonnes."}</Empty>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          {/* sélecteur de colonne (mobile) */}
          <div className="mb-3 flex gap-1 overflow-x-auto md:hidden">
            {cols.map((c) => (
              <button key={c.id} className={`btn btn-sm shrink-0 ${mobileColId === c.id ? "btn-primary" : ""}`} onClick={() => setMobileCol({ ...mobileCol, [view]: c.id })}>
                {c.label} <span className="opacity-70">{scoped.filter((x) => colOf(x) === c.id).length}</span>
              </button>
            ))}
            {admin && <AddButton label={view === "status" ? "Ajouter une colonne" : "Créer un sprint"} onClick={() => (view === "status" ? setColEdit("new") : setSprintEdit("new"))} />}
          </div>

          <div className="overflow-x-auto">
            <div className="md:min-w-[900px]">
              {/* en-têtes de colonnes */}
              <div className="mb-1 hidden items-stretch gap-3 py-2 md:flex">
                <div className="grid flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                  {cols.map((c) => (
                    <div key={c.id} className="group flex min-w-0 items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold text-ink" title={c.hint}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="min-w-0 truncate">{c.label}</span>
                      <span className="ml-auto text-xs text-muted">{scoped.filter((x) => colOf(x) === c.id).length}</span>
                      {c.menu && <Menu items={c.menu} label="Options de la colonne" />}
                    </div>
                  ))}
                </div>
                {admin && (
                  <div className="flex w-6 items-center">
                    <AddButton label={view === "status" ? "Ajouter une colonne" : "Créer un sprint"} onClick={() => (view === "status" ? setColEdit("new") : setSprintEdit("new"))} />
                  </div>
                )}
              </div>

              {lanes.map((lane) => {
                const key = lane.id ?? "none";
                const count = scoped.filter((c) => laneOf(c) === lane.id).length;
                const isCollapsed = collapsed[key] ?? false;
                const menu = laneMenu(lane);
                return (
                  <div key={key} className="mb-3">
                    <div className="group mb-2 flex items-center gap-2">
                      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setCollapsed({ ...collapsed, [key]: !isCollapsed })} aria-expanded={!isCollapsed}>
                        <IconChevronDown className={`shrink-0 text-muted transition ${isCollapsed ? "-rotate-90" : ""}`} />
                        <span className="truncate font-display text-base font-bold text-heading">{lane.label}</span>
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{count}</span>
                        {lane.leader && <span className="hidden truncate text-xs text-muted sm:inline">{lane.leader}</span>}
                      </button>
                      {menu.length > 0 && <Menu items={menu} label={`Options du stream ${lane.stream?.name}`} />}
                    </div>
                    {!isCollapsed &&
                      (isMobile ? (
                        <Cell id={`cell|${key}|${mobileColId}`} cards={cellCards(lane.id, mobileColId)} onOpen={onOpen} canEdit={acc.canEdit} showStatus={view === "sprints"} onAdd={() => addAt(lane.id, mobileColId)} />
                      ) : (
                        <div className={`grid gap-3 ${admin ? "md:mr-9" : ""}`} style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                          {cols.map((c) => (
                            <Cell key={c.id} id={`cell|${key}|${c.id}`} cards={cellCards(lane.id, c.id)} onOpen={onOpen} canEdit={acc.canEdit} showStatus={view === "sprints"} onAdd={() => addAt(lane.id, c.id)} />
                          ))}
                        </div>
                      ))}
                  </div>
                );
              })}
              {admin && (
                <button className="mt-1 rounded-lg px-2 py-1 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-accent" onClick={() => setStreamEdit("new")}>
                  + Ajouter un stream
                </button>
              )}
            </div>
          </div>
          <DragOverlay>{dragging ? <CardTile card={dragging} overlay showStatus={view === "sprints"} /> : null}</DragOverlay>
        </DndContext>
      )}
      {admin && !statuses.length && (
        <button className="btn btn-sm mt-3" onClick={() => setColEdit("new")}>
          <IconPlus /> Ajouter une colonne
        </button>
      )}

      <NewCardModal init={creating} onClose={() => setCreating(null)} onCreated={(c) => (mutate(), onOpen(c))} />
      <SprintModal item={sprintEdit} onClose={() => setSprintEdit(null)} onSaved={(s) => sprintEdit === "new" && view === "status" && setSprintId(s.id)} />
      <StreamModal item={streamEdit} onClose={() => setStreamEdit(null)} />
      <OptionModal item={colEdit} kind="CARD_STATUS" onClose={() => setColEdit(null)} />
      <FreshnessModal open={freshOpen} onClose={() => setFreshOpen(false)} />
      {sw.node}
    </section>
  );
}

function SprintTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold transition ${active ? "border-accent bg-accent/15 text-ink" : "border-line-soft text-ink-2 hover:border-accent/60"}`} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`btn btn-sm ${active ? "btn-primary" : ""}`} onClick={onClick} aria-pressed={active}>
      {children}
    </button>
  );
}

function Cell({ id, cards, onOpen, canEdit, onAdd, showStatus }: { id: string; cards: Card[]; onOpen: (c: Card) => void; canEdit: boolean; onAdd: () => void; showStatus: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canEdit });
  return (
    <div ref={setNodeRef} className={`group flex min-h-[64px] flex-col gap-2 rounded-xl border p-2 transition ${isOver ? "border-accent bg-accent/10" : "border-line-soft bg-surface/40"}`}>
      {cards.map((c) => (
        <DraggableCard key={c.id} card={c} onOpen={onOpen} canEdit={canEdit} showStatus={showStatus} />
      ))}
      {canEdit && (
        <button className="rounded-lg py-0.5 text-xs text-muted opacity-60 transition hover:bg-surface-2 hover:text-ink focus:opacity-100 md:opacity-0 md:group-hover:opacity-100" onClick={onAdd} aria-label="Ajouter une carte ici">
          + Ajouter
        </button>
      )}
    </div>
  );
}

function DraggableCard({ card, onOpen, canEdit, showStatus }: { card: Card; onOpen: (c: Card) => void; canEdit: boolean; showStatus: boolean }) {
  const drag = useDraggable({ id: card.id, disabled: !canEdit });
  const drop = useDroppable({ id: `card|${card.id}`, disabled: !canEdit });
  return (
    <div
      ref={(n) => {
        drag.setNodeRef(n);
        drop.setNodeRef(n);
      }}
      {...drag.listeners}
      {...drag.attributes}
      role="button"
      tabIndex={0}
      // la carte s'ouvre pour tous ; seul le glisser est réservé aux éditeurs
      aria-disabled={false}
      aria-roledescription={canEdit ? "carte déplaçable" : "carte"}
      aria-label={`Carte ${card.ref} : ${card.title}`}
      className={`${drag.isDragging ? "opacity-30" : ""} ${drop.isOver && !drag.isDragging ? "pt-3" : ""} rounded-lg transition-[padding] [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(card);
        }
      }}
    >
      <CardTile card={card} showStatus={showStatus} />
    </div>
  );
}

function CardTile({ card, overlay = false, showStatus = false }: { card: Card; overlay?: boolean; showStatus?: boolean }) {
  const acc = useAcc();
  const lvl = card.alertLevelId ? acc.opt.get(card.alertLevelId) : null;
  const owner = card.ownerId ? acc.ctc.get(card.ownerId)?.name : "";
  const st = showStatus && card.statusId ? acc.opt.get(card.statusId) : null;
  const done = acc.isDone(card.statusId);
  return (
    <div
      className={`cursor-pointer rounded-lg border bg-surface p-2.5 text-left shadow-sm transition hover:border-accent ${overlay ? "rotate-2 shadow-2xl" : ""} ${done && showStatus ? "opacity-60" : ""}`}
      style={{ borderColor: lvl ? `color-mix(in srgb, ${tone[lvl.color]} 55%, transparent)` : "var(--border-soft)", borderLeftWidth: lvl ? 3 : 1, borderLeftColor: lvl ? tone[lvl.color] : undefined }}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1 text-[0.86rem] font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
          {card.emoji && <span className="mr-1">{card.emoji}</span>}
          {card.title}
        </span>
        {lvl && <span title={lvl.label}>{lvl.emoji || "●"}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-muted">
        {st && <Pill option={st} small />}
        {owner && <span className="truncate">{owner}</span>}
        {card.dueDate && <span className={isOverdue(card.dueDate) && !done ? "font-semibold text-red" : ""}>{frDate(card.dueDate, false)}</span>}
        {!!card.commentCount && (
          <span className="inline-flex items-center gap-0.5">
            <IconComment width={12} height={12} />
            {card.commentCount}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <FreshnessTag card={card} />
          <span className="opacity-60">#{card.ref}</span>
        </span>
      </div>
      {card.progressPct !== null && card.progressPct !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded bg-surface-3">
          <div className="h-full bg-accent" style={{ width: `${card.progressPct}%` }} />
        </div>
      )}
    </div>
  );
}

function NewCardModal({ init, onClose, onCreated }: { init: { streamId: string | null; statusId: string | null; sprintId: string | null } | null; onClose: () => void; onCreated: (c: Card) => void }) {
  const acc = useAcc();
  const [title, setTitle] = useState("");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [sprint, setSprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = init ? `${init.streamId}-${init.statusId}-${init.sprintId}` : "";
  const [lastKey, setLastKey] = useState("");
  if (init && key !== lastKey) {
    setLastKey(key);
    setStreamId(init.streamId);
    setStatusId(init.statusId);
    setSprint(init.sprintId);
    setTitle("");
  }
  const close = () => (onClose(), setLastKey(""));
  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const c = await api<Card>(`${acc.base}/e/card`, { method: "POST", json: { title: title.trim(), streamId, statusId, sprintId: sprint } });
      close();
      onCreated(c);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!init}
      onClose={close}
      title="Nouvelle carte"
      footer={
        <>
          <button className="btn" onClick={close}>
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
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.repeat && create()} />
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
        <p className="text-xs text-muted">Les autres champs (porteur, dates, alertes…) se renseignent ensuite dans la carte.</p>
      </div>
    </Modal>
  );
}

/** Une seule version du kanban est rendue (bureau ou mobile) pour éviter des zones de dépôt en double. */
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
