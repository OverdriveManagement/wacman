"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { download, fetcher } from "@/lib/api";
import { dateTime, frDate, isOverdue, relative, todayIso } from "@/lib/format";
import { useClient, useMe, useQuestions } from "@/lib/hooks";
import type { Party, Question } from "@/lib/types";
import { ClientContext, useCl, useQuestionActions } from "@/components/ClientContext";
import { TopBar } from "@/components/TopBar";
import { Disclosure, Empty, InlineText, Spinner, Toggle, useConfirm } from "@/components/ui";
import { DateTag, Popover } from "@/components/Tag";
import { Markdown } from "@/components/Markdown";
import { IconChevron, IconClock, IconClip, IconDownload, IconFilter, IconPlus, IconSearch, IconUpload, IconX } from "@/components/icons";
import { AssignTag, PartyTag, StatusTag, StreamsTag, partyColor } from "@/components/questions/Tags";
import { Thread } from "@/components/questions/Thread";
import { HistoryModal } from "@/components/questions/History";
import { NavetteImport } from "@/components/questions/NavetteImport";
import { NewQuestionModal } from "@/components/questions/NewQuestion";
import { Menu } from "@/components/Menu";

type SortKey = "ref" | "subject" | "streams" | "askedBy" | "createdAt" | "assigned" | "status" | "messages" | "due" | "activity";
type View = { status: "open" | "closed" | "all"; assigned: "all" | Party; stream: string | null; mine: boolean; late: boolean; sort: { key: SortKey; dir: "asc" | "desc" } };
const DEFAULT_VIEW: View = { status: "open", assigned: "all", stream: null, mine: false, late: false, sort: { key: "activity", dir: "desc" } };

/** Critères de tri (sélecteur sur mobile). */
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "ref", label: "Réf." },
  { key: "subject", label: "Sujet et question" },
  { key: "streams", label: "Streams" },
  { key: "askedBy", label: "Posée par" },
  { key: "createdAt", label: "Posée le" },
  { key: "assigned", label: "Attribuée à" },
  { key: "status", label: "Statut" },
  { key: "messages", label: "Échanges" },
  { key: "due", label: "Échéance" },
  { key: "activity", label: "Mise à jour" },
];
/** Colonnes du tableau (largeurs fixes, le sujet prend la place restante) ; « Posée par » trie par nom ou par date. */
const HEAD: { id: string; width: number | null; sorts: { key: SortKey; label: string; title: string }[] }[] = [
  { id: "ref", width: 60, sorts: [{ key: "ref", label: "Réf.", title: "Trier par numéro" }] },
  { id: "subject", width: null, sorts: [{ key: "subject", label: "Sujet et question", title: "Trier par sujet" }] },
  { id: "streams", width: 146, sorts: [{ key: "streams", label: "Streams", title: "Trier par stream" }] },
  {
    id: "asked",
    width: 142,
    sorts: [
      { key: "askedBy", label: "Posée par", title: "Trier par auteur de la question" },
      { key: "createdAt", label: "le", title: "Trier par date de la question" },
    ],
  },
  { id: "assigned", width: 104, sorts: [{ key: "assigned", label: "Attribuée à", title: "Trier par attribution" }] },
  { id: "status", width: 98, sorts: [{ key: "status", label: "Statut", title: "Trier par statut" }] },
  { id: "messages", width: 150, sorts: [{ key: "messages", label: "Échanges", title: "Trier par nombre d'échanges" }] },
  { id: "due", width: 96, sorts: [{ key: "due", label: "Échéance", title: "Trier par échéance" }] },
  { id: "activity", width: 92, sorts: [{ key: "activity", label: "Mise à jour", title: "Trier par dernière mise à jour" }] },
];
const TABLE_MIN = 1100;
const STATUS_ORDER = { OPEN: 0, IN_PROGRESS: 1, CLOSED: 2 } as const;
const coll = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

export default function ClientPage() {
  const { slug } = useParams<{ slug: string }>();
  const cl = useClient(slug);
  if (cl.error && !cl.data) {
    return (
      <>
        <TopBar client={slug} />
        <main className="mx-auto max-w-xl p-8">
          <p className="text-sm text-red">{(cl.error as Error).message || "Client inaccessible."}</p>
          <Link href="/" className="btn mt-4">
            Retour à l'accueil
          </Link>
        </main>
      </>
    );
  }
  if (!cl.data) return <Spinner />;
  return (
    <ClientContext.Provider value={cl}>
      <TopBar client={slug} />
      <QuestionsView />
    </ClientContext.Provider>
  );
}

/** Tableau sur grand écran (1200 px et plus), cartes en dessous : une seule présentation est rendue. */
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 1200px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1200px)").matches,
    () => true,
  );
}

function useView(slug: string) {
  const key = `wibridge-view-${slug}`;
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setView({ ...DEFAULT_VIEW, ...JSON.parse(raw), mine: false, late: false });
    } catch {
      /* préférence non lue */
    }
  }, [key]);
  const update = useCallback(
    (p: Partial<View>) =>
      setView((v) => {
        const n = { ...v, ...p };
        try {
          localStorage.setItem(key, JSON.stringify({ status: n.status, assigned: n.assigned, stream: n.stream, sort: n.sort }));
        } catch {
          /* préférence non mémorisée */
        }
        return n;
      }),
    [key],
  );
  return [view, update] as const;
}

function compare(a: Question, b: Question, key: SortKey, cl: ReturnType<typeof useCl>) {
  switch (key) {
    case "ref":
      return a.ref - b.ref;
    case "subject":
      return coll.compare(a.subject, b.subject);
    case "streams": {
      const fa = a.streamIds.map((s) => cl.order.get(s) ?? 99).sort((x, y) => x - y)[0] ?? 99;
      const fb = b.streamIds.map((s) => cl.order.get(s) ?? 99).sort((x, y) => x - y)[0] ?? 99;
      return fa - fb || a.streamIds.length - b.streamIds.length;
    }
    case "askedBy":
      return coll.compare(a.askedBy.name, b.askedBy.name) || a.createdAt.localeCompare(b.createdAt);
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt);
    case "assigned": {
      const la = a.status === "CLOSED" ? "~" : cl.label(a.assignedParty);
      const lb = b.status === "CLOSED" ? "~" : cl.label(b.assignedParty);
      return coll.compare(la, lb);
    }
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "messages":
      return a.messageCount - b.messageCount || (a.lastMessage?.createdAt ?? "").localeCompare(b.lastMessage?.createdAt ?? "");
    case "due":
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    case "activity":
      return a.lastActivityAt.localeCompare(b.lastActivityAt);
  }
}

function QuestionsView() {
  const cl = useCl();
  const slug = cl.data.client.slug;
  const [trash, setTrash] = useState(false);
  const { data: questions, error } = useQuestions(slug, trash);
  const [view, setView] = useView(slug);
  const [q, setQ] = useState("");
  const [serverHits, setServerHits] = useState<Set<string> | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Question | null>(null);
  // fiche navette : import réservé aux personnes qui peuvent répondre quelque part (pas aux lecteurs)
  const [navetteFile, setNavetteFile] = useState<File | null>(null);
  const navetteInput = useRef<HTMLInputElement>(null);
  const canAnswer = cl.data.me.isSuperAdmin || Object.values(cl.data.me.access).some((a) => a !== "NONE" && a !== "READ");
  const [creating, setCreating] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const wide = useWide();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const me = cl.data.me;
  const { data: meData } = useMe();
  const myId = meData?.user.id ?? "";
  const today = todayIso();

  // recherche dans les échanges et les pièces jointes (côté serveur, insensible aux accents)
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return setServerHits(null);
    const t = setTimeout(() => {
      fetcher<{ ids: string[] }>(`${cl.base}/search?q=${encodeURIComponent(text)}`)
        .then((r) => setServerHits(new Set(r.ids)))
        .catch(() => setServerHits(null));
    }, 250);
    return () => clearTimeout(t);
  }, [q, cl.base]);

  const toggle = (id: string, force?: boolean) =>
    setOpenIds((s) => {
      const n = new Set(s);
      if (force ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  // lien direct ?q=12 (e-mails) : la question est dépliée et mise en évidence
  const linked = params.get("q");
  useEffect(() => {
    if (!linked || !questions) return;
    const target = questions.find((x) => String(x.ref) === linked.replace("#", ""));
    router.replace(pathname, { scroll: false });
    if (!target) return;
    if (target.status === "CLOSED" && view.status === "open") setView({ status: "all" });
    if (view.stream && !target.streamIds.includes(view.stream)) setView({ stream: null });
    if (view.assigned !== "all" && view.assigned !== target.assignedParty) setView({ assigned: "all" });
    toggle(target.id, true);
    setFlash(target.ref);
    setTimeout(() => document.querySelector(`[data-question-ref="${target.ref}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, questions]);

  const all = questions ?? [];
  const counts = useMemo(() => {
    const open = all.filter((x) => x.status !== "CLOSED");
    return {
      provider: open.filter((x) => x.assignedParty === "PROVIDER").length,
      client: open.filter((x) => x.assignedParty === "CLIENT").length,
      late: open.filter((x) => x.dueDate && x.dueDate < today).length,
      closed: all.length - open.length,
      open: open.length,
    };
  }, [all, today]);

  const list = useMemo(() => {
    const text = q.trim().toLowerCase();
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const nt = norm(text);
    const rows = all.filter((x) => {
      // une question dépliée reste affichée même si elle ne correspond plus aux filtres (clôturée, réattribuée)
      if (!trash && !openIds.has(x.id)) {
        if (view.status === "open" && x.status === "CLOSED") return false;
        if (view.status === "closed" && x.status !== "CLOSED") return false;
        if (view.assigned !== "all" && (x.status === "CLOSED" || x.assignedParty !== view.assigned)) return false;
        if (view.stream && !x.streamIds.includes(view.stream)) return false;
        if (view.mine && x.askedBy.id !== myId) return false;
        if (view.late && !(x.status !== "CLOSED" && x.dueDate && x.dueDate < today)) return false;
      }
      if (nt) {
        const hit = String(x.ref) === nt.replace("#", "") || norm(`${x.subject}\n${x.body}\n${x.askedBy.name}`).includes(nt) || (serverHits?.has(x.id) ?? false);
        if (!hit) return false;
      }
      return true;
    });
    const dir = view.sort.dir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      // sans échéance : toujours en fin de liste
      if (view.sort.key === "due" && !!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
      return dir * compare(a, b, view.sort.key, cl) || b.ref - a.ref;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, view, q, serverHits, trash, today, myId, openIds]);

  const filter = (p: Partial<View>) => {
    setOpenIds(new Set());
    setView(p);
  };
  const sortBy = (key: SortKey) => setView({ sort: { key, dir: view.sort.key === key ? (view.sort.dir === "asc" ? "desc" : "asc") : key === "subject" || key === "askedBy" || key === "streams" || key === "assigned" || key === "status" || key === "due" ? "asc" : "desc" } });
  const filtersOn = view.status !== "open" || view.assigned !== "all" || !!view.stream || view.mine || view.late || !!q.trim();
  const resetFilters = () => {
    filter({ status: "open", assigned: "all", stream: null, mine: false, late: false });
    setQ("");
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 pb-24 pt-4 md:px-6">
      {/* en-tête */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink md:text-3xl">
            <span>{cl.data.client.emoji}</span>
            <span className="truncate">{cl.data.client.name}</span>
            {trash && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-amber">Corbeille</span>}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Questions et demandes d'éléments entre {cl.label("PROVIDER")} et {cl.label("CLIENT")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cl.canCreate && !trash && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <IconPlus /> Nouvelle question
            </button>
          )}
          <button
            className="btn"
            onClick={() => download(`${cl.base}/export.xlsx?status=${view.status}&assigned=${view.assigned}${view.stream ? `&stream=${view.stream}` : ""}`)}
            title="Exporter la fiche navette Excel des questions affichées (statut, attribution et stream choisis), avec des colonnes pour répondre"
          >
            <IconDownload /> <span className="hidden sm:inline">Fiche navette</span>
          </button>
          {canAnswer && !trash && (
            <>
              <button className="btn" onClick={() => navetteInput.current?.click()} title="Importer une fiche navette remplie : réponses et nouveaux attribués">
                <IconUpload /> <span className="hidden sm:inline">Importer</span>
              </button>
              <input
                ref={navetteInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                aria-label="Fiche navette à importer"
                onChange={(e) => {
                  setNavetteFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </>
          )}
          {me.isSuperAdmin && (
            <Menu
              label="Plus d'actions"
              items={[
                { label: trash ? "Revenir aux questions" : "Corbeille (questions supprimées)", onClick: () => setTrash(!trash) },
                { label: "Configurer ce client", onClick: () => router.push(`/admin?client=${cl.data.client.id}`) },
              ]}
            />
          )}
        </div>
      </div>

      {/* compteurs cliquables */}
      {!trash && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Counter label={`À traiter par ${cl.label("CLIENT")}`} n={counts.client} color={partyColor("CLIENT")} on={view.assigned === "CLIENT" && view.status === "open"} onClick={() => filter({ assigned: view.assigned === "CLIENT" ? "all" : "CLIENT", status: "open" })} />
          <Counter label={`À traiter par ${cl.label("PROVIDER")}`} n={counts.provider} color={partyColor("PROVIDER")} on={view.assigned === "PROVIDER" && view.status === "open"} onClick={() => filter({ assigned: view.assigned === "PROVIDER" ? "all" : "PROVIDER", status: "open" })} />
          <Counter label="En retard" n={counts.late} color="var(--red)" on={view.late} onClick={() => filter({ late: !view.late, status: "open" })} />
          <Counter label="Clôturées" n={counts.closed} color="var(--teal)" on={view.status === "closed"} onClick={() => filter({ status: view.status === "closed" ? "open" : "closed", assigned: "all", late: false })} />
        </div>
      )}

      {cl.data.client.description?.trim() && !trash && (
        <div className="mb-3">
          <Disclosure title="Mode d'emploi">
            <Markdown text={cl.data.client.description} />
          </Disclosure>
        </div>
      )}

      {/* filtres (repliés sur mobile, sauf la recherche) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
          <input className="input !pl-8" placeholder="Rechercher" title="Sujet, texte, échanges ou numéro" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
          {q && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick={() => setQ("")} aria-label="Effacer la recherche">
              <IconX width={14} height={14} />
            </button>
          )}
        </div>
        {!trash && (
          <button className={`btn btn-sm sm:hidden ${filtersOn ? "!border-accent" : ""}`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
            <IconFilter width={15} height={15} /> Filtres{filtersOn ? " (actifs)" : ""}
          </button>
        )}
        {!trash && (
          <div className={`${showFilters ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}>
            <Seg
              label="Statut"
              value={view.status}
              onChange={(v) => filter({ status: v })}
              options={[
                { id: "open", label: "Ouvertes" },
                { id: "closed", label: "Clôturées" },
                { id: "all", label: "Toutes" },
              ]}
            />
            <Seg
              label="Attribuées à"
              value={view.assigned}
              onChange={(v) => filter({ assigned: v })}
              options={[
                { id: "all", label: "Tous" },
                { id: "PROVIDER", label: cl.label("PROVIDER") },
                { id: "CLIENT", label: cl.label("CLIENT") },
              ]}
            />
            <StreamFilter value={view.stream} onChange={(v) => filter({ stream: v })} />
            <Toggle checked={view.mine} onChange={(v) => filter({ mine: v })} label="Mes questions" />
            {!wide && <SortSelect view={view} onChange={(sort) => setView({ sort })} />}
            {filtersOn && (
              <button className="text-xs font-semibold text-accent hover:underline" onClick={resetFilters}>
                Réinitialiser
              </button>
            )}
          </div>
        )}
      </div>

      {error && !questions ? (
        <p className="text-sm text-red">{(error as Error).message}</p>
      ) : !questions ? (
        <Spinner label="Chargement des questions…" />
      ) : !list.length ? (
        <Empty>
          {all.length === 0 && !trash ? (
            cl.canCreate ? (
              <>Aucune question pour l'instant. Posez la première avec « Nouvelle question ».</>
            ) : (
              <>Aucune question pour l'instant.</>
            )
          ) : trash ? (
            "La corbeille est vide."
          ) : (
            <>
              Aucune question pour ces filtres.{" "}
              <button className="font-semibold text-accent hover:underline" onClick={resetFilters}>
                Réinitialiser les filtres
              </button>
            </>
          )}
        </Empty>
      ) : (
        <>
          <div className="mb-1.5 text-xs text-muted">
            {list.length} question{list.length > 1 ? "s" : ""}
            {list.length !== all.length ? ` sur ${all.length}` : ""}
          </div>
          {/* ordinateur : tableau triable */}
          {wide ? (
          <div className="table-wrap">
            <table className="data fixed-cells" aria-label="Questions" style={{ tableLayout: "fixed", minWidth: TABLE_MIN }}>
              <colgroup>
                <col style={{ width: 34 }} />
                {HEAD.map((h) => (
                  <col key={h.id} style={h.width ? { width: h.width } : undefined} />
                ))}
                <col style={{ width: 70 }} />
              </colgroup>
              <thead>
                <tr>
                  <th aria-label="Échanges" />
                  {HEAD.map((h) => {
                    const active = h.sorts.find((x) => x.key === view.sort.key);
                    return (
                      <th key={h.id} aria-sort={active ? (view.sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                        <span className="inline-flex flex-wrap items-center gap-x-2">
                          {h.sorts.map((x) => (
                            <button key={x.key} type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => sortBy(x.key)} title={x.title} data-sort={x.key}>
                              {x.label}
                              <SortMark on={view.sort.key === x.key} dir={view.sort.dir} />
                            </button>
                          ))}
                        </span>
                      </th>
                    );
                  })}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <Fragment key={x.id}>
                    <Row q={x} open={openIds.has(x.id)} onToggle={() => toggle(x.id)} onExpand={() => toggle(x.id, true)} onHistory={() => setHistory(x)} flash={flash === x.ref} />
                    {openIds.has(x.id) && (
                      <tr className="thread-row">
                        <td colSpan={HEAD.length + 2}>
                          <Thread id={x.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
          /* mobile et tablette : une carte par question */
          <div className="space-y-2.5">
            {list.map((x) => (
              <CardItem key={x.id} q={x} open={openIds.has(x.id)} onToggle={() => toggle(x.id)} onExpand={() => toggle(x.id, true)} onHistory={() => setHistory(x)} flash={flash === x.ref} />
            ))}
          </div>
          )}
        </>
      )}

      <HistoryModal q={history} onClose={() => setHistory(null)} />
      <NavetteImport file={navetteFile} onClose={() => setNavetteFile(null)} />
      <NewQuestionModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(ref) => {
          setView({ status: "open", assigned: "all", stream: null, late: false });
          setQ("");
          router.replace(`${pathname}?q=${ref}`, { scroll: false });
        }}
      />
    </main>
  );
}

function Counter({ label, n, color, on, onClick }: { label: string; n: number; color: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition hover:brightness-110"
      style={{ borderColor: on ? color : "var(--border-soft)", background: on ? `color-mix(in srgb, ${color} 14%, transparent)` : "var(--surface)" }}
    >
      <span className="font-display text-lg font-bold leading-none" style={{ color }}>
        {n}
      </span>
      <span className="text-ink-2">{label}</span>
    </button>
  );
}

function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5 text-xs" role="radiogroup" aria-label={label} title={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={`rounded-md px-2.5 py-1 font-semibold transition ${value === o.id ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StreamFilter({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const cl = useCl();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const cur = value ? cl.str.get(value) : null;
  const visible = cl.data.streams.filter((s) => cl.access(s.id) !== "NONE" || cl.data.me.isSuperAdmin);
  return (
    <>
      <button ref={ref} className={`btn btn-sm ${cur ? "!border-accent" : ""}`} onClick={() => setOpen(true)} aria-label="Filtrer par stream">
        {cur ? `${cur.emoji ? `${cur.emoji} ` : ""}${cur.name}` : "Tous les streams"}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={250}>
        <div className="px-2 pb-1 pt-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Stream</div>
        <button className={`flex w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${!value ? "font-semibold text-ink" : "text-ink-2"}`} onClick={() => (onChange(null), setOpen(false))}>
          Tous les streams
        </button>
        {visible.map((s) => (
          <button key={s.id} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${value === s.id ? "font-semibold text-ink" : "text-ink-2"}`} onClick={() => (onChange(s.id), setOpen(false))}>
            <span>{s.emoji}</span>
            <span className="truncate">{s.name}</span>
            {!s.active && <span className="ml-auto text-[0.65rem] text-muted">inactif</span>}
          </button>
        ))}
      </Popover>
    </>
  );
}

/** Tri sur mobile (sur ordinateur, un clic sur l'en-tête de colonne trie). */
function SortSelect({ view, onChange }: { view: View; onChange: (s: View["sort"]) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted">
      Trier par
      <select className="input !w-auto !py-1 text-xs" value={view.sort.key} onChange={(e) => onChange({ key: e.target.value as SortKey, dir: view.sort.dir })} aria-label="Trier par">
        {COLUMNS.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <button className="btn btn-sm !px-2" onClick={() => onChange({ key: view.sort.key, dir: view.sort.dir === "asc" ? "desc" : "asc" })} aria-label={view.sort.dir === "asc" ? "Ordre croissant" : "Ordre décroissant"}>
        {view.sort.dir === "asc" ? "Croissant" : "Décroissant"}
      </button>
    </label>
  );
}

function SortMark({ on, dir }: { on: boolean; dir: "asc" | "desc" }) {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden className={on ? "text-accent" : "text-muted/50"}>
      <path d="M5 1L9 5H1z" fill="currentColor" opacity={on && dir === "asc" ? 1 : on ? 0.25 : 0.6} />
      <path d="M5 11L1 7h8z" fill="currentColor" opacity={on && dir === "desc" ? 1 : on ? 0.25 : 0.6} />
    </svg>
  );
}

function RowMenu({ q }: { q: Question }) {
  const act = useQuestionActions();
  const confirm = useConfirm();
  if (!q.perms.delete && !q.perms.restore) return null;
  return (
    <>
      <Menu
        label="Options de la question"
        items={[
          ...(q.perms.restore ? [{ label: "Restaurer la question", onClick: () => act.restore(q.id) }] : []),
          ...(q.perms.delete
            ? [
                {
                  label: "Supprimer la question",
                  danger: true,
                  onClick: () => confirm.ask("Supprimer la question", `La question n°${q.ref} « ${q.subject.slice(0, 80)} » sera retirée de la liste.`, () => act.remove(q.id)),
                },
              ]
            : []),
        ]}
      />
      {confirm.node}
    </>
  );
}

function Exchanges({ q, open, onToggle }: { q: Question; open: boolean; onToggle: () => void }) {
  const cl = useCl();
  return (
    <button className="group w-full text-left" data-row-toggle onClick={onToggle} aria-expanded={open} aria-label={`${q.messageCount} échange(s) : ${open ? "masquer" : "afficher"}`}>
      <span className="text-sm font-semibold text-ink-2 group-hover:text-accent">
        {q.messageCount === 0 ? "Aucune réponse" : `${q.messageCount} échange${q.messageCount > 1 ? "s" : ""}`}
        {q.fileCount > 0 && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-normal text-muted" title={`${q.fileCount} pièce(s) jointe(s)`}>
            <IconClip width={12} height={12} />
            {q.fileCount}
          </span>
        )}
      </span>
      {q.lastMessage && (
        <span className="mt-0.5 block text-xs text-muted" title={`Dernier message : ${q.lastMessage.authorName} (${cl.label(q.lastMessage.party)}), ${dateTime(q.lastMessage.createdAt)}`}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: partyColor(q.lastMessage.party) }} aria-hidden />
            <span className="truncate">{q.lastMessage.authorName}</span>
          </span>
          <span className="block pl-3.5">{relative(q.lastMessage.createdAt)}</span>
        </span>
      )}
    </button>
  );
}

function Subject({ q, onExpand }: { q: Question; onExpand: () => void }) {
  const act = useQuestionActions();
  if (!q.perms.edit || q.deletedAt)
    return (
      <button className="text-left text-sm font-semibold text-ink [overflow-wrap:anywhere] hover:text-accent" data-row-toggle onClick={onExpand}>
        {q.subject}
      </button>
    );
  return (
    <InlineText
      value={q.subject}
      onSave={(v) => (v.trim() ? act.update(q.id, { subject: v.trim() }) : undefined)}
      render={(v) => <span className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{v}</span>}
    />
  );
}

function Body({ q }: { q: Question }) {
  const act = useQuestionActions();
  // texte vide : rien dans la liste (il se saisit dans les échanges ou en cliquant ici quand il existe)
  if (!q.body.trim()) return null;
  return (
    <InlineText
      multiline
      disabled={!q.perms.edit || !!q.deletedAt}
      value={q.body}
      placeholder="Ajouter le texte de la question…"
      className="text-xs text-ink-2"
      render={(v) => <Markdown text={v} className="line-clamp-2 text-xs text-ink-2" />}
      onSave={(v) => act.update(q.id, { body: v })}
    />
  );
}

function Due({ q, small = false }: { q: Question; small?: boolean }) {
  const act = useQuestionActions();
  const late = q.status !== "CLOSED" && isOverdue(q.dueDate);
  return <DateTag small={small} label="Échéance" disabled={!q.perms.edit || !!q.deletedAt} value={q.dueDate} danger={late} onChange={(v) => act.update(q.id, { dueDate: v })} />;
}

/**
 * Un clic n'importe où sur une question repliée la déplie. Sur le sujet et le texte (`data-expand-only`), ce premier clic
 * ne fait que déplier : ils se modifient ensuite d'un clic, la question dépliée. Sur une étiquette (streams, attribution,
 * statut, échéance), le choix s'ouvre en plus. La flèche, le numéro et les échanges plient et déplient ; une sélection
 * de texte ne déplie pas.
 */
function expandOnClick(open: boolean, onExpand: () => void) {
  return (e: ReactMouseEvent<HTMLElement>) => {
    if (open) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("[data-row-toggle]")) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.anchorNode && e.currentTarget.contains(sel.anchorNode)) return;
    onExpand();
    if (target?.closest("[data-expand-only]")) e.stopPropagation();
  };
}

function Row({ q, open, onToggle, onExpand, onHistory, flash }: { q: Question; open: boolean; onToggle: () => void; onExpand: () => void; onHistory: () => void; flash: boolean }) {
  const stripe = q.status === "CLOSED" ? "transparent" : partyColor(q.assignedParty);
  return (
    <tr
      className={`${open ? "row-open" : "cursor-pointer"} ${flash ? "flash" : ""} ${q.status === "CLOSED" ? "opacity-75" : ""}`}
      data-question-ref={q.ref}
      onClickCapture={expandOnClick(open, onExpand)}
    >
      <td style={{ boxShadow: `inset 3px 0 0 ${stripe}` }}>
        <button className="mt-0.5 rounded p-0.5 text-muted transition hover:bg-surface-3 hover:text-ink" data-row-toggle onClick={onToggle} aria-expanded={open} aria-label={open ? "Masquer les échanges" : "Afficher les échanges"}>
          <IconChevron className={`transition ${open ? "rotate-90" : ""}`} width={16} height={16} />
        </button>
      </td>
      <td className="whitespace-nowrap text-xs font-semibold text-muted">
        <button data-row-toggle onClick={onToggle} className="hover:text-accent">
          n°{q.ref}
        </button>
      </td>
      <td>
        <div data-expand-only>
          <Subject q={q} onExpand={onToggle} />
          {!open && <Body q={q} />}
        </div>
      </td>
      <td>
        <StreamsTag q={q} />
      </td>
      <td>
        <div className="truncate text-sm text-ink-2" title={q.askedBy.name}>
          {q.askedBy.name || "Utilisateur supprimé"}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <PartyTag party={q.askedByParty} />
          <span className="whitespace-nowrap text-xs text-muted" title={dateTime(q.createdAt)}>
            {frDate(q.createdAt.slice(0, 10))}
          </span>
        </div>
      </td>
      <td>
        <AssignTag q={q} />
      </td>
      <td>
        <StatusTag q={q} />
      </td>
      <td>
        <Exchanges q={q} open={open} onToggle={onToggle} />
      </td>
      <td>
        <Due q={q} small />
      </td>
      <td className="whitespace-nowrap text-xs" title={dateTime(q.lastActivityAt)}>
        {relative(q.lastActivityAt)}
      </td>
      <td>
        <div className="flex items-center justify-end gap-0.5">
          <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink" onClick={onHistory} aria-label={`Historique de la question n°${q.ref}`} title="Historique des modifications">
            <IconClock width={16} height={16} />
          </button>
          <RowMenu q={q} />
        </div>
      </td>
    </tr>
  );
}

function CardItem({ q, open, onToggle, onExpand, onHistory, flash }: { q: Question; open: boolean; onToggle: () => void; onExpand: () => void; onHistory: () => void; flash: boolean }) {
  const cl = useCl();
  const stripe = q.status === "CLOSED" ? "var(--border)" : partyColor(q.assignedParty);
  return (
    <div className={`card overflow-hidden ${flash ? "flash" : ""}`} style={{ borderLeft: `3px solid ${stripe}` }} data-question-ref={q.ref}>
      <div className={`space-y-1.5 p-3 ${open ? "" : "cursor-pointer"}`} onClickCapture={expandOnClick(open, onExpand)}>
        <div className="flex flex-wrap items-center gap-1.5">
          <button data-row-toggle onClick={onToggle} className="text-xs font-semibold text-muted hover:text-accent">
            n°{q.ref}
          </button>
          <StatusTag q={q} />
          <AssignTag q={q} />
          <span className="ml-auto flex items-center gap-0.5">
            <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" onClick={onHistory} aria-label={`Historique de la question n°${q.ref}`}>
              <IconClock width={16} height={16} />
            </button>
            <RowMenu q={q} />
          </span>
        </div>
        <div data-expand-only className="space-y-1.5">
          <Subject q={q} onExpand={onToggle} />
          {!open && <Body q={q} />}
        </div>
        <StreamsTag q={q} wrap />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            Posée par {q.askedBy.name || "un utilisateur supprimé"} ({cl.label(q.askedByParty)}), le {frDate(q.createdAt.slice(0, 10))}
          </span>
          {(q.dueDate || (q.perms.edit && !q.deletedAt)) && (
            <span className="inline-flex items-center gap-1">
              Échéance <Due q={q} />
            </span>
          )}
        </div>
        <div className="border-t border-line-soft pt-1.5">
          <Exchanges q={q} open={open} onToggle={onToggle} />
        </div>
      </div>
      {open && (
        <div className="border-t border-line-soft bg-surface-2/40">
          <Thread id={q.id} />
        </div>
      )}
    </div>
  );
}

