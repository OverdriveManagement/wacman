"use client";

import useSWR from "swr";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, download, fetcher, toast } from "@/lib/api";
import { frDate, longDate, todayIso, tone } from "@/lib/format";
import type { Card, Highlight, Meeting, MeetingType, StreamStatus, Topic } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { useCreators, useMe } from "@/lib/hooks";
import { Markdown } from "@/components/Markdown";
import { Callout, Disclosure, Empty, Field, InlineText, Modal, OptionSelect, Pill, Spinner, useConfirm } from "@/components/ui";
import { Comments, History } from "@/components/Comments";
import { IconChevron, IconComment, IconCopy, IconDown, IconDownload, IconEdit, IconPlus, IconPrint, IconTrash, IconUp } from "@/components/icons";
import { meetingReportText } from "@/lib/report";
import { AlertCards } from "@/components/AlertCards";
import { Planning } from "@/components/Planning";
import { CardModal } from "@/components/CardModal";
import { MeetingTypeModal } from "@/components/MeetingTypeModal";
import { Menu, OptionModal } from "@/components/config";
import { RichField } from "@/components/RichText";

/**
 * Page d'un type de séance (Program weekly, COPROJ, Strategic Committee…) : une séance à la fois,
 * choisie dans le sélecteur (la plus récente par défaut), avec ses blocs saisis par séance
 * (faits marquants, statut des streams, sujets) puis les vues à date du kanban
 * (cartes en vigilance ou en alerte, planning des cartes par stream).
 */
export default function MeetingsPage() {
  const acc = useAcc();
  const { typeId } = useParams<{ typeId: string }>();
  const type = acc.data.meetingTypes.find((t) => t.id === typeId);
  const { data: meetings, mutate } = useSWR<Meeting[]>(type ? `${acc.base}/meetings?typeId=${typeId}` : null, fetcher);
  const live = !!type && (type.blocks.includes("ALERT_CARDS") || type.blocks.includes("PLANNING"));
  const { data: cards, mutate: mutateCards } = useSWR<Card[]>(live ? `${acc.base}/cards` : null, fetcher);
  const [creating, setCreating] = useState<"empty" | "previous" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [typeEdit, setTypeEdit] = useState<MeetingType | "new" | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const target = params.get("m");
  const confirm = useConfirm();

  // lien direct vers une séance (recherche, tableau de bord) : sélectionnée, puis le lien est retiré de l'adresse
  useEffect(() => {
    if (!target || !meetings) return;
    if (meetings.some((m) => m.id === target)) setSelected(target);
    router.replace(pathname, { scroll: false });
  }, [target, meetings, router, pathname]);

  if (!type) return <Empty>Type de séance introuvable.</Empty>;
  const idx = meetings ? Math.max(0, meetings.findIndex((m) => m.id === selected)) : 0;
  const meeting = meetings?.[idx] ?? null;
  const stored = type.blocks.filter((b) => b === "HIGHLIGHTS" || b === "STREAM_STATUS" || b === "TOPICS");
  const reload = () => mutate();

  return (
    <div className="space-y-6">
      {/* en-tête du type de séance */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink">
            {type.emoji} {type.name}
          </h1>
          {type.frequency && <p className="text-sm text-muted">{type.frequency}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acc.canEdit && stored.length > 0 && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => setCreating("previous")} disabled={!meetings?.length} title="Recopie la séance précédente à une nouvelle date">
                <IconCopy /> Nouvelle séance à partir de la précédente
              </button>
              <button className="btn btn-sm" onClick={() => setCreating("empty")}>
                <IconPlus /> Séance vide
              </button>
            </>
          )}
          {stored.length > 0 && (
            <button className="btn btn-sm" onClick={() => download(`${acc.base}/export/meetings.xlsx?typeId=${type.id}`)} title="Toutes les séances de ce type, en Excel">
              <IconDownload /> Excel
            </button>
          )}
          {acc.isAdmin && (
            <Menu
              label="Options du type de séance"
              items={[
                { label: "Modifier ce type de séance", onClick: () => setTypeEdit(type) },
                { label: "Nouveau type de séance", onClick: () => setTypeEdit("new") },
              ]}
            />
          )}
        </div>
      </div>
      <Callout text={type.description} icon={type.emoji || "💡"} />

      {/* séance affichée */}
      {stored.length > 0 &&
        (!meetings ? (
          <Spinner />
        ) : !meeting ? (
          <Empty>Aucune séance pour l'instant. {acc.canEdit ? "Créez la première avec « Séance vide »." : ""}</Empty>
        ) : (
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5 md:px-4">
              <button className="btn btn-ghost btn-sm !px-1.5" disabled={idx >= meetings.length - 1} onClick={() => setSelected(meetings[idx + 1].id)} aria-label="Séance précédente" title="Séance précédente">
                <IconChevron className="rotate-180" />
              </button>
              <select className="input !w-auto min-w-0 flex-1 font-display !text-base font-bold text-heading sm:flex-none" value={meeting.id} onChange={(e) => setSelected(e.target.value)} aria-label="Séance">
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {type.name} du {longDate(m.date)}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm !px-1.5" disabled={idx <= 0} onClick={() => setSelected(meetings[idx - 1].id)} aria-label="Séance suivante" title="Séance suivante">
                <IconChevron />
              </button>
              {meeting.date > todayIso() && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">à venir</span>}
              <div className="flex-1" />
              <button
                className="btn btn-ghost btn-sm"
                title="Copier le compte rendu (texte prêt pour un e-mail)"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(meetingReportText(meeting, type, acc));
                    toast("success", "Compte rendu copié : collez-le dans votre e-mail.");
                  } catch {
                    toast("error", "Copie impossible dans ce navigateur.");
                  }
                }}
              >
                <IconCopy /> <span className="hidden sm:inline">Copier le CR</span>
              </button>
              <a className="btn btn-ghost btn-sm" href={`/print/${acc.data.account.slug}/meeting/${meeting.id}`} target="_blank" rel="noreferrer" title="Imprimer ou enregistrer en PDF">
                <IconPrint /> <span className="hidden sm:inline">PDF</span>
              </a>
              {acc.canEdit && (
                <Menu
                  label="Options de la séance"
                  items={[
                    {
                      label: "Changer la date",
                      onClick: () => {
                        const el = document.getElementById(`date-${meeting.id}`) as HTMLInputElement | null;
                        el?.showPicker?.();
                        el?.focus();
                      },
                    },
                    "sep",
                    {
                      label: "Supprimer la séance",
                      danger: true,
                      onClick: () =>
                        confirm.ask("Supprimer la séance", `La séance du ${longDate(meeting.date)} et tout son contenu seront supprimés.`, async () => {
                          await api(`${acc.base}/e/meeting/${meeting.id}`, { method: "DELETE" });
                          setSelected(null);
                          reload();
                        }),
                    },
                  ]}
                />
              )}
              {acc.canEdit && (
                <input
                  id={`date-${meeting.id}`}
                  type="date"
                  className="input !w-auto !py-1 text-xs"
                  value={meeting.date}
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    await api(`${acc.base}/e/meeting/${meeting.id}`, { method: "PATCH", json: { date: e.target.value } });
                    reload();
                  }}
                  aria-label="Date de la séance"
                  title="Date de la séance"
                />
              )}
            </div>
            <div className="space-y-8 p-3 md:p-4">
              {stored.includes("HIGHLIGHTS") && <HighlightsBlock meeting={meeting} reload={reload} />}
              {stored.includes("STREAM_STATUS") && <StatusBlock meeting={meeting} type={type} reload={reload} />}
              {stored.includes("TOPICS") && <TopicsBlock meeting={meeting} type={type} reload={reload} />}
            </div>
          </section>
        ))}

      {/* vues à date du kanban */}
      {type.blocks.includes("ALERT_CARDS") && (
        <section>
          <LiveTitle icon="🚨" title="Cartes en vigilance ou en alerte" />
          <AlertCards cards={cards} onOpen={setOpenCard} />
        </section>
      )}
      {type.blocks.includes("PLANNING") && (
        <section>
          <LiveTitle icon="🗓️" title="Planning des livrables par stream" />
          <Planning cards={cards} onOpen={setOpenCard} onSaved={() => mutateCards()} />
        </section>
      )}

      {type.guide && (
        <Disclosure title="Mode d'emploi">
          <Markdown text={type.guide} />
        </Disclosure>
      )}

      <NewMeetingModal
        type={type}
        mode={creating}
        onClose={() => setCreating(null)}
        onCreated={(m) => {
          mutate();
          setSelected(m.id);
        }}
      />
      <CardModal
        card={openCard}
        onClose={() => setOpenCard(null)}
        onChanged={(c, removed) => {
          if (!c) return mutateCards();
          mutateCards((list) => (removed ? (list ?? []).filter((x) => x.id !== c.id) : (list ?? []).map((x) => (x.id === c.id ? { ...x, ...c } : x))), { revalidate: false });
        }}
        onDuplicated={(c) => (mutateCards(), setOpenCard(c))}
      />
      <MeetingTypeModal item={typeEdit} onClose={() => setTypeEdit(null)} />
      {confirm.node}
    </div>
  );
}

function LiveTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="section-title flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h2>
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Vision à date : situation au {frDate(todayIso())}</span>
    </div>
  );
}

function NewMeetingModal({ type, mode, onClose, onCreated }: { type: MeetingType; mode: "empty" | "previous" | null; onClose: () => void; onCreated: (m: Meeting) => void }) {
  const acc = useAcc();
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const m = await api<Meeting>(`${acc.base}/meetings`, { method: "POST", json: { meetingTypeId: type.id, date, mode } });
      toast("success", mode === "previous" ? "Séance créée à partir de la précédente." : "Séance créée.");
      onClose();
      onCreated(m);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === "previous" ? `Nouvelle séance ${type.name} à partir de la précédente` : `Nouvelle séance ${type.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={busy || !date} onClick={create}>
            Créer la séance
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Date de la séance">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <p className="text-sm text-ink-2">
          {mode === "previous"
            ? type.blocks.includes("TOPICS")
              ? "Les sujets du comité précédent sont recopiés (picto, ordre, thématique, nature, description, arbitrage demandé) sans les lignes « Décision : … »."
              : type.blocks.includes("STREAM_STATUS")
                ? "Pour chaque stream, le statut, l'avancement et les alertes de la séance précédente sont recopiés."
                : "Les faits marquants de la séance précédente sont recopiés à la nouvelle date : il ne reste qu'à modifier ce qui a changé."
            : type.blocks.includes("STREAM_STATUS")
              ? "Les streams marqués « ligne de séance » sont créés vides."
              : "La séance est créée vide."}
        </p>
      </div>
    </Modal>
  );
}

async function patch(base: string, entity: string, id: string, data: unknown) {
  return api(`${base}/e/${entity}/${id}`, { method: "PATCH", json: data });
}

async function move<T extends { id: string }>(base: string, entity: string, list: T[], index: number, dir: -1 | 1) {
  const j = index + dir;
  if (j < 0 || j >= list.length) return;
  const ids = list.map((x) => x.id);
  [ids[index], ids[j]] = [ids[j], ids[index]];
  await api(`${base}/e/${entity}/reorder`, { method: "POST", json: { ids } });
}

// ---------------------------------------------------------------------------
// Faits marquants : édition directe sur la carte (titre, détail, type, stream), ajout rapide
// ---------------------------------------------------------------------------
function HighlightsBlock({ meeting, reload }: { meeting: Meeting; reload: () => void }) {
  const acc = useAcc();
  const { data: meData } = useMe();
  const create = useCreators(acc);
  const [edit, setEdit] = useState<Highlight | "new" | null>(null);
  const [draft, setDraft] = useState("");
  const ro = !acc.canEdit;
  const streams = acc.data.streams.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }));
  const quickAdd = async () => {
    const title = draft.trim();
    if (!title) return;
    const me = acc.data.contacts.find((c) => c.userId && c.userId === meData?.user.id);
    await api(`${acc.base}/e/highlight`, { method: "POST", json: { title, meetingId: meeting.id, order: meeting.highlights.length + 1, authorId: me?.id ?? null } });
    setDraft("");
    reload();
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-ink">📰 Faits marquants</h3>
        {!ro && <span className="hidden text-xs text-muted md:inline">Cliquez sur un texte pour le modifier.</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {meeting.highlights.map((h, i) => {
          const t = h.typeId ? acc.opt.get(h.typeId) : null;
          return (
            <article key={h.id} className="group relative flex flex-col rounded-xl border border-line-soft bg-surface-2/60 p-3.5">
              <div className="mb-1 flex items-start gap-1.5 pr-14">
                {h.emoji && <span className="mt-0.5 text-base">{h.emoji}</span>}
                <InlineText disabled={ro} value={h.title} onSave={async (v) => (v.trim() ? (await patch(acc.base, "highlight", h.id, { title: v.trim() }), reload()) : toast("error", "Le titre est obligatoire."))} render={(v) => <span className="font-display text-base font-bold leading-snug text-accent">{v}</span>} className="flex-1" />
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {ro ? (
                  <>
                    {t && <Pill option={t} small />}
                    {h.streamId && (
                      <span className="text-xs font-semibold text-ocre">
                        {acc.str.get(h.streamId)?.emoji} {acc.str.get(h.streamId)?.name}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <select
                      className="rounded-full border border-line-soft bg-transparent px-2 py-0.5 text-[0.7rem] font-semibold"
                      style={t ? { color: tone[t.color], borderColor: `color-mix(in srgb, ${tone[t.color]} 40%, transparent)` } : { color: "var(--muted)" }}
                      value={h.typeId ?? ""}
                      onChange={async (e) => (await patch(acc.base, "highlight", h.id, { typeId: e.target.value || null }), reload())}
                      aria-label="Type"
                    >
                      <option value="">Type…</option>
                      {acc.byKind("HIGHLIGHT_TYPE").map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.emoji} {o.label}
                        </option>
                      ))}
                    </select>
                    <select className="max-w-[12rem] truncate rounded-full border border-line-soft bg-transparent px-2 py-0.5 text-[0.7rem] font-semibold text-ocre" value={h.streamId ?? ""} onChange={async (e) => (await patch(acc.base, "highlight", h.id, { streamId: e.target.value || null }), reload())} aria-label="Stream">
                      <option value="">Stream…</option>
                      {streams.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.emoji} {s.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <InlineText multiline disabled={ro} value={h.detail} onSave={async (v) => (await patch(acc.base, "highlight", h.id, { detail: v }), reload())} className="text-sm text-ink-2" placeholder="Détail du fait marquant…" />
              <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                {!ro && (
                  <>
                    <button className="btn btn-sm btn-ghost !px-1" aria-label="Monter" onClick={async () => (await move(acc.base, "highlight", meeting.highlights, i, -1), reload())}>
                      <IconUp width={13} height={13} />
                    </button>
                    <button className="btn btn-sm btn-ghost !px-1" aria-label="Descendre" onClick={async () => (await move(acc.base, "highlight", meeting.highlights, i, 1), reload())}>
                      <IconDown width={13} height={13} />
                    </button>
                  </>
                )}
                <button className="btn btn-sm btn-ghost !px-1" aria-label="Détails, commentaires et historique" title="Détails, commentaires et historique" onClick={() => setEdit(h)}>
                  <IconEdit width={13} height={13} />
                </button>
              </div>
            </article>
          );
        })}
        {!ro && (
          <div className="flex flex-col justify-center rounded-xl border border-dashed border-line p-3.5">
            <input
              className="input"
              placeholder="+ Nouveau fait marquant (titre puis Entrée)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && quickAdd()}
              aria-label="Nouveau fait marquant"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[0.7rem] text-muted">Détail, type et stream se complètent ensuite sur la carte.</span>
              <button className="btn btn-sm shrink-0" onClick={() => setEdit("new")}>
                Formulaire complet
              </button>
            </div>
          </div>
        )}
        {ro && !meeting.highlights.length && <Empty>Aucun fait marquant.</Empty>}
      </div>
      <HighlightModal meeting={meeting} item={edit} onClose={() => setEdit(null)} reload={reload} onCreateType={create.option("HIGHLIGHT_TYPE")} />
    </div>
  );
}

function HighlightModal({
  meeting,
  item,
  onClose,
  reload,
  onCreateType,
}: {
  meeting: Meeting;
  item: Highlight | "new" | null;
  onClose: () => void;
  reload: () => void;
  onCreateType?: (label: string) => Promise<string>;
}) {
  const acc = useAcc();
  const { data: meData } = useMe();
  const isNew = item === "new";
  type HForm = { title: string; emoji: string; detail: string; streamId: string | null; typeId: string | null };
  const init: HForm = isNew || !item ? { title: "", emoji: "", detail: "", streamId: null, typeId: null } : item;
  const [form, setForm] = useState<HForm>(init);
  const [key, setKey] = useState<string>("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setForm(init);
  }
  const confirm = useConfirm();
  const ro = !acc.canEdit;
  const save = async () => {
    if (!form.title.trim()) return toast("error", "Le titre est obligatoire.");
    const data = { title: form.title.trim(), emoji: form.emoji, detail: form.detail, streamId: form.streamId, typeId: form.typeId };
    if (isNew) {
      const me = acc.data.contacts.find((c) => c.userId && c.userId === meData?.user.id);
      await api(`${acc.base}/e/highlight`, { method: "POST", json: { ...data, meetingId: meeting.id, order: meeting.highlights.length + 1, authorId: me?.id ?? null } });
    } else if (item) await patch(acc.base, "highlight", item.id, data);
    reload();
    onClose();
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={isNew ? "Nouveau fait marquant" : "Fait marquant"}
      wide
      footer={
        !ro && (
          <>
            {!isNew && item && (
              <button
                className="btn btn-danger mr-auto"
                onClick={() =>
                  confirm.ask("Supprimer le fait marquant", "Ce fait marquant sera supprimé.", async () => {
                    await api(`${acc.base}/e/highlight/${item.id}`, { method: "DELETE" });
                    reload();
                    onClose();
                  })
                }
              >
                <IconTrash /> Supprimer
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={save}>
              Enregistrer
            </button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[90px_1fr]">
          <Field label="Picto">
            <input className="input text-center" maxLength={8} disabled={ro} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="🚀" />
          </Field>
          <Field label="Fait marquant">
            <input className="input" disabled={ro} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Stream">
            <OptionSelect disabled={ro} options={acc.data.streams.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }))} value={form.streamId} onChange={(v) => setForm({ ...form, streamId: v })} />
          </Field>
          <Field label="Type">
            <OptionSelect disabled={ro} options={acc.byKind("HIGHLIGHT_TYPE")} value={form.typeId} onChange={(v) => setForm({ ...form, typeId: v })} placeholder="Sans type" onCreate={onCreateType} createLabel="Nouveau type…" />
          </Field>
        </div>
        <Field label="Détail" hint="**gras** et puces « • » acceptés.">
          <RichField rows={6} disabled={ro} value={form.detail} onChange={(v) => setForm({ ...form, detail: v })} />
        </Field>
        {!isNew && item && (
          <details className="rounded-xl border border-line-soft px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">Commentaires et historique</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Comments entityType="highlight" entityId={item.id} />
              <History entityType="highlight" entityId={item.id} />
            </div>
          </details>
        )}
      </div>
      {confirm.node}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Statut des streams
// ---------------------------------------------------------------------------
function StatusChips({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const acc = useAcc();
  const opts = acc.byKind("STREAM_STATUS");
  const [adding, setAdding] = useState(false);
  if (disabled)
    return (
      <div className="flex flex-col items-start gap-1">
        {value.map((id) => (
          <Pill key={id} option={acc.opt.get(id)} small />
        ))}
      </div>
    );
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={`rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold transition ${on ? "" : "opacity-40 grayscale hover:opacity-80"}`}
            style={{ color: tone[o.color], borderColor: `color-mix(in srgb, ${tone[o.color]} 40%, transparent)`, background: on ? `color-mix(in srgb, ${tone[o.color]} 14%, transparent)` : "transparent" }}
            title={on ? "Retirer ce statut" : "Ajouter ce statut"}
          >
            {o.emoji} {o.label}
          </button>
        );
      })}
      {acc.isAdmin && (
        <button className="rounded-full border border-dashed border-line px-2 py-0.5 text-[0.7rem] text-muted hover:text-accent" onClick={() => setAdding(true)} title="Nouveau statut de stream">
          +
        </button>
      )}
      <OptionModal item={adding ? "new" : null} kind="STREAM_STATUS" onClose={() => setAdding(false)} onSaved={(o) => onChange([...value, o.id])} />
    </div>
  );
}

function StatusBlock({ meeting, type, reload }: { meeting: Meeting; type: MeetingType; reload: () => void }) {
  const acc = useAcc();
  const confirm = useConfirm();
  const ro = !acc.canEdit;
  const st = type.settings ?? {};
  const [comments, setComments] = useState<StreamStatus | null>(null);
  const streams = acc.data.streams.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }));
  const add = async () => {
    await api(`${acc.base}/e/streamStatus`, { method: "POST", json: { meetingId: meeting.id, statusIds: [], order: meeting.statuses.length + 1 } });
    reload();
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">📊 Statut des streams</h3>
        {!ro && (
          <button className="btn btn-sm" onClick={add}>
            <IconPlus /> Ajouter une ligne
          </button>
        )}
      </div>
      {!meeting.statuses.length ? (
        <Empty>Aucune ligne.</Empty>
      ) : (
        <div className="space-y-3 lg:space-y-0">
          <div className="hidden grid-cols-[220px_190px_1fr_1fr_60px] gap-3 rounded-t-xl bg-surface-2 px-3 py-2 text-[0.72rem] font-semibold text-muted lg:grid">
            <div>Stream</div>
            <div>{st.statusLabel ?? "Statut"}</div>
            <div>{st.progressLabel ?? "Avancement"}</div>
            <div>{st.alertsLabel ?? "Alertes & prérequis"}</div>
            <div />
          </div>
          {meeting.statuses.map((r, i) => {
            const firstStatus = r.statusIds[0] ? acc.opt.get(r.statusIds[0]) : null;
            return (
              <div
                key={r.id}
                className="grid gap-3 rounded-xl border border-line-soft bg-surface-2/40 p-3 lg:grid-cols-[220px_190px_1fr_1fr_60px] lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent"
                style={firstStatus ? { boxShadow: `inset 3px 0 0 ${tone[firstStatus.color]}` } : undefined}
              >
                <div>
                  {ro ? (
                    <div className="font-semibold text-ink">{r.streamId ? `${acc.str.get(r.streamId)?.emoji ?? ""} ${acc.str.get(r.streamId)?.name ?? ""}` : "-"}</div>
                  ) : (
                    <OptionSelect options={streams} value={r.streamId} onChange={async (v) => (await patch(acc.base, "streamStatus", r.id, { streamId: v }), reload())} className="!py-1 text-sm font-semibold" />
                  )}
                </div>
                <div>
                  <span className="label lg:hidden">{st.statusLabel ?? "Statut"}</span>
                  <StatusChips value={r.statusIds} disabled={ro} onChange={async (v) => (await patch(acc.base, "streamStatus", r.id, { statusIds: v }), reload())} />
                </div>
                <div>
                  <span className="label lg:hidden">{st.progressLabel ?? "Avancement"}</span>
                  <InlineText multiline disabled={ro} value={r.progress} onSave={async (v) => (await patch(acc.base, "streamStatus", r.id, { progress: v }), reload())} className="text-sm text-ink-2" />
                </div>
                <div>
                  <span className="label lg:hidden">{st.alertsLabel ?? "Alertes & prérequis"}</span>
                  <InlineText multiline disabled={ro} value={r.alerts} onSave={async (v) => (await patch(acc.base, "streamStatus", r.id, { alerts: v }), reload())} className="text-sm text-ink-2" />
                </div>
                <div className="flex items-start gap-0.5 lg:flex-col lg:items-end">
                  <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Commentaires" onClick={() => setComments(r)}>
                    <IconComment width={14} height={14} />
                  </button>
                  {!ro && (
                    <>
                      <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Monter" onClick={async () => (await move(acc.base, "streamStatus", meeting.statuses, i, -1), reload())}>
                        <IconUp width={14} height={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Descendre" onClick={async () => (await move(acc.base, "streamStatus", meeting.statuses, i, 1), reload())}>
                        <IconDown width={14} height={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-danger !px-1.5"
                        aria-label="Supprimer la ligne"
                        onClick={() =>
                          confirm.ask("Supprimer la ligne", "Cette ligne de statut sera supprimée.", async () => {
                            await api(`${acc.base}/e/streamStatus/${r.id}`, { method: "DELETE" });
                            reload();
                          })
                        }
                      >
                        <IconTrash width={14} height={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Modal open={!!comments} onClose={() => setComments(null)} title="Commentaires et historique" wide>
        {comments && (
          <div className="grid gap-4 md:grid-cols-2">
            <Comments entityType="streamStatus" entityId={comments.id} />
            <History entityType="streamStatus" entityId={comments.id} />
          </div>
        )}
      </Modal>
      {confirm.node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sujets (Strategic Committee)
// ---------------------------------------------------------------------------
function TopicsBlock({ meeting, type, reload }: { meeting: Meeting; type: MeetingType; reload: () => void }) {
  const acc = useAcc();
  const [edit, setEdit] = useState<Topic | "new" | null>(null);
  const decisionLabel = type.settings?.decisionLabel ?? "Arbitrage ou décision demandée";
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">🗂️ Sujets</h3>
        {acc.canEdit && (
          <button className="btn btn-sm" onClick={() => setEdit("new")}>
            <IconPlus /> Ajouter un sujet
          </button>
        )}
      </div>
      {!meeting.topics.length ? (
        <Empty>Aucun sujet.</Empty>
      ) : (
        <>
          <div className="table-wrap hidden lg:block">
            <table className="data">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th className="w-[19%]">Sujet</th>
                  <th>Thématique</th>
                  <th>Nature</th>
                  <th className="w-[33%]">Description</th>
                  <th className="w-[27%]">{decisionLabel}</th>
                  {acc.canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {meeting.topics.map((t, i) => (
                  <tr key={t.id}>
                    <td className="text-muted">{i + 1}</td>
                    <td className="cursor-pointer font-semibold text-ink" onClick={() => setEdit(t)}>
                      {t.emoji && <span className="mr-1">{t.emoji}</span>}
                      {t.title}
                    </td>
                    <td>
                      <Pill option={t.themeId ? acc.opt.get(t.themeId) : null} small />
                    </td>
                    <td>
                      <Pill option={t.natureId ? acc.opt.get(t.natureId) : null} small />
                    </td>
                    <td>
                      <InlineText multiline disabled={!acc.canEdit} value={t.description} onSave={async (v) => (await patch(acc.base, "topic", t.id, { description: v }), reload())} className="text-[0.83rem]" />
                    </td>
                    <td>
                      <InlineText multiline disabled={!acc.canEdit} value={t.decisionRequest} onSave={async (v) => (await patch(acc.base, "topic", t.id, { decisionRequest: v }), reload())} className="text-[0.83rem]" />
                    </td>
                    {acc.canEdit && (
                      <td className="whitespace-nowrap">
                        <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Monter" onClick={async () => (await move(acc.base, "topic", meeting.topics, i, -1), reload())}>
                          <IconUp width={14} height={14} />
                        </button>
                        <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Descendre" onClick={async () => (await move(acc.base, "topic", meeting.topics, i, 1), reload())}>
                          <IconDown width={14} height={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 lg:hidden">
            {meeting.topics.map((t, i) => (
              <button key={t.id} onClick={() => setEdit(t)} className="block w-full rounded-xl border border-line-soft bg-surface-2/50 p-3 text-left">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted">{i + 1}.</span>
                  <span className="flex-1 font-semibold text-ink">
                    {t.emoji} {t.title}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Pill option={t.themeId ? acc.opt.get(t.themeId) : null} small />
                  <Pill option={t.natureId ? acc.opt.get(t.natureId) : null} small />
                </div>
                <Markdown text={t.description} className="mt-2 line-clamp-4 text-sm text-ink-2" />
                {t.decisionRequest && <Markdown text={t.decisionRequest} className="mt-2 border-t border-line-soft pt-2 text-sm text-ink-2" />}
              </button>
            ))}
          </div>
        </>
      )}
      <TopicModal meeting={meeting} item={edit} decisionLabel={decisionLabel} onClose={() => setEdit(null)} reload={reload} />
    </div>
  );
}

function TopicModal({ meeting, item, decisionLabel, onClose, reload }: { meeting: Meeting; item: Topic | "new" | null; decisionLabel: string; onClose: () => void; reload: () => void }) {
  const acc = useAcc();
  const create = useCreators(acc);
  const isNew = item === "new";
  type TForm = { title: string; emoji: string; themeId: string | null; natureId: string | null; description: string; decisionRequest: string };
  const init: TForm = isNew || !item ? { title: "", emoji: "📌", themeId: null, natureId: null, description: "", decisionRequest: "" } : item;
  const [form, setForm] = useState<TForm>(init);
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setForm(init);
  }
  const confirm = useConfirm();
  const ro = !acc.canEdit;
  const save = async () => {
    if (!form.title.trim()) return toast("error", "Le sujet est obligatoire.");
    const data = { title: form.title.trim(), emoji: form.emoji, themeId: form.themeId, natureId: form.natureId, description: form.description, decisionRequest: form.decisionRequest };
    if (isNew) await api(`${acc.base}/e/topic`, { method: "POST", json: { ...data, meetingId: meeting.id, order: meeting.topics.length + 1 } });
    else if (item) await patch(acc.base, "topic", item.id, data);
    reload();
    onClose();
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      wide
      title={isNew ? "Nouveau sujet" : "Sujet"}
      footer={
        !ro && (
          <>
            {!isNew && item && (
              <button
                className="btn btn-danger mr-auto"
                onClick={() =>
                  confirm.ask("Supprimer le sujet", "Ce sujet sera supprimé de la séance.", async () => {
                    await api(`${acc.base}/e/topic/${item.id}`, { method: "DELETE" });
                    reload();
                    onClose();
                  })
                }
              >
                <IconTrash /> Supprimer
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={save}>
              Enregistrer
            </button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[90px_1fr]">
          <Field label="Picto">
            <input className="input text-center" maxLength={8} disabled={ro} value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          </Field>
          <Field label="Sujet">
            <input className="input" disabled={ro} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Thématique">
            <OptionSelect disabled={ro} options={acc.byKind("TOPIC_THEME")} value={form.themeId} onChange={(v) => setForm({ ...form, themeId: v })} onCreate={create.option("TOPIC_THEME")} createLabel="Nouvelle thématique…" />
          </Field>
          <Field label="Nature">
            <OptionSelect disabled={ro} options={acc.byKind("TOPIC_NATURE")} value={form.natureId} onChange={(v) => setForm({ ...form, natureId: v })} onCreate={create.option("TOPIC_NATURE")} createLabel="Nouvelle nature…" />
          </Field>
        </div>
        <Field label="Description" hint="**gras** et puces « • » acceptés.">
          <RichField rows={6} disabled={ro} value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
        </Field>
        <Field label={decisionLabel} hint="En séance, ajouter une ligne « Décision : … ».">
          <RichField rows={4} disabled={ro} value={form.decisionRequest} onChange={(v) => setForm({ ...form, decisionRequest: v })} />
        </Field>
        {!isNew && item && (
          <details className="rounded-xl border border-line-soft px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">Commentaires et historique</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Comments entityType="topic" entityId={item.id} />
              <History entityType="topic" entityId={item.id} />
            </div>
          </details>
        )}
      </div>
      {confirm.node}
    </Modal>
  );
}
