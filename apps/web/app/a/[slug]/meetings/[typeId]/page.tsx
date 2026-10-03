"use client";

import useSWR from "swr";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, download, fetcher, toast } from "@/lib/api";
import { longDate, todayIso, tone } from "@/lib/format";
import type { Highlight, Meeting, MeetingType, StreamStatus, Topic } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { useMe } from "@/lib/hooks";
import { Markdown } from "@/components/Markdown";
import { Callout, Disclosure, Empty, Field, InlineText, Modal, OptionSelect, Pill, Spinner, useConfirm } from "@/components/ui";
import { Comments, History } from "@/components/Comments";
import { IconChevronDown, IconComment, IconCopy, IconDown, IconDownload, IconPlus, IconPrint, IconTrash, IconUp } from "@/components/icons";
import { meetingReportText } from "@/lib/report";

export default function MeetingsPage() {
  const acc = useAcc();
  const { typeId } = useParams<{ typeId: string }>();
  const type = acc.data.meetingTypes.find((t) => t.id === typeId);
  const { data: meetings, mutate } = useSWR<Meeting[]>(type ? `${acc.base}/meetings?typeId=${typeId}` : null, fetcher);
  const [creating, setCreating] = useState<"empty" | "previous" | null>(null);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const target = params.get("m");
  // lien direct vers une séance (recherche, tableau de bord) : on l'ouvre, on la montre, puis le lien est retiré de l'adresse
  useEffect(() => {
    if (!target || !meetings) return;
    if (meetings.some((m) => m.id === target)) {
      setOpenIds((o) => ({ ...o, [meetings[0].id]: meetings[0].id === target, [target]: true }));
      setTimeout(() => document.getElementById(`meeting-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
    router.replace(pathname, { scroll: false });
  }, [target, meetings, router, pathname]);
  if (!type) return <Empty>Type de séance introuvable.</Empty>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            {type.emoji} {type.name}
          </h1>
          {type.frequency && <p className="text-sm text-muted">{type.frequency}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {acc.canEdit && (
            <>
              <button className="btn btn-primary" onClick={() => setCreating("empty")}>
                <IconPlus /> Nouvelle séance
              </button>
              <button className="btn" onClick={() => setCreating("previous")} disabled={!meetings?.length}>
                <IconCopy /> À partir de la précédente
              </button>
            </>
          )}
          <button className="btn" onClick={() => download(`${acc.base}/export/meetings.xlsx?typeId=${type.id}`)}>
            <IconDownload /> Excel
          </button>
        </div>
      </div>
      <Callout text={type.description} icon={type.emoji || "💡"} />

      {!meetings ? (
        <Spinner />
      ) : !meetings.length ? (
        <Empty>Aucune séance pour l'instant. Créez la première avec « Nouvelle séance ».</Empty>
      ) : (
        <div className="space-y-4">
          {meetings.map((m, i) => {
            const open = openIds[m.id] ?? i === 0;
            return <MeetingSection key={m.id} meeting={m} type={type} open={open} onToggle={() => setOpenIds({ ...openIds, [m.id]: !open })} reload={() => mutate()} />;
          })}
        </div>
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
          setOpenIds({ [m.id]: true });
        }}
      />
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
                : "Les faits marquants de la séance précédente sont recopiés à la nouvelle date."
            : type.blocks.includes("STREAM_STATUS")
              ? "Les streams marqués « ligne de séance » sont créés vides."
              : "La séance est créée vide."}
        </p>
      </div>
    </Modal>
  );
}

function MeetingSection({ meeting, type, open, onToggle, reload }: { meeting: Meeting; type: MeetingType; open: boolean; onToggle: () => void; reload: () => void }) {
  const acc = useAcc();
  const confirm = useConfirm();
  const count = meeting.highlights.length + meeting.statuses.length + meeting.topics.length;
  return (
    <section id={`meeting-${meeting.id}`} className="card scroll-mt-20 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onToggle} aria-expanded={open}>
          <IconChevronDown className={`shrink-0 text-muted transition ${open ? "" : "-rotate-90"}`} />
          <span className="truncate font-display text-lg font-bold text-heading">
            {type.name} du {longDate(meeting.date)}
          </span>
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{count}</span>
        </button>
        {open && (
          <div className="flex items-center gap-1">
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
          </div>
        )}
        {acc.canEdit && open && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input !w-auto !py-1 text-xs"
              value={meeting.date}
              onChange={async (e) => {
                if (!e.target.value) return;
                await api(`${acc.base}/e/meeting/${meeting.id}`, { method: "PATCH", json: { date: e.target.value } });
                reload();
              }}
              aria-label="Date de la séance"
            />
            <button
              className="btn btn-ghost btn-sm btn-danger"
              aria-label="Supprimer la séance"
              onClick={() =>
                confirm.ask("Supprimer la séance", `La séance du ${longDate(meeting.date)} et tout son contenu seront supprimés.`, async () => {
                  await api(`${acc.base}/e/meeting/${meeting.id}`, { method: "DELETE" });
                  reload();
                })
              }
            >
              <IconTrash />
            </button>
          </div>
        )}
      </div>
      {open && (
        <div className="space-y-6 p-4">
          {type.blocks.includes("HIGHLIGHTS") && <HighlightsBlock meeting={meeting} reload={reload} />}
          {type.blocks.includes("STREAM_STATUS") && <StatusBlock meeting={meeting} type={type} reload={reload} />}
          {type.blocks.includes("TOPICS") && <TopicsBlock meeting={meeting} type={type} reload={reload} />}
        </div>
      )}
      {confirm.node}
    </section>
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
// Faits marquants
// ---------------------------------------------------------------------------
function HighlightsBlock({ meeting, reload }: { meeting: Meeting; reload: () => void }) {
  const acc = useAcc();
  const [edit, setEdit] = useState<Highlight | "new" | null>(null);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">📰 Faits marquants</h3>
        {acc.canEdit && (
          <button className="btn btn-sm" onClick={() => setEdit("new")}>
            <IconPlus /> Ajouter un fait marquant
          </button>
        )}
      </div>
      {!meeting.highlights.length ? (
        <Empty>Aucun fait marquant.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {meeting.highlights.map((h, i) => {
            const t = h.typeId ? acc.opt.get(h.typeId) : null;
            const s = h.streamId ? acc.str.get(h.streamId) : null;
            return (
              <article key={h.id} className="group relative rounded-xl border border-line-soft bg-surface-2/60 p-4">
                <button className="block w-full text-left" onClick={() => setEdit(h)}>
                  <div className="mb-1 flex items-start gap-2">
                    <h4 className="flex-1 font-display text-base font-bold leading-snug text-accent">
                      {h.emoji && <span className="mr-1">{h.emoji}</span>}
                      {h.title}
                    </h4>
                    {t && <Pill option={t} small />}
                  </div>
                  {s && (
                    <div className="mb-2 text-xs font-semibold text-ocre">
                      {s.emoji} {s.name}
                    </div>
                  )}
                  <Markdown text={h.detail} className="text-sm text-ink-2" />
                </button>
                {acc.canEdit && (
                  <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                    <button className="btn btn-sm btn-ghost !px-1.5" aria-label="Monter" onClick={async () => (await move(acc.base, "highlight", meeting.highlights, i, -1), reload())}>
                      <IconUp width={14} height={14} />
                    </button>
                    <button className="btn btn-sm btn-ghost !px-1.5" aria-label="Descendre" onClick={async () => (await move(acc.base, "highlight", meeting.highlights, i, 1), reload())}>
                      <IconDown width={14} height={14} />
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <HighlightModal meeting={meeting} item={edit} onClose={() => setEdit(null)} reload={reload} />
    </div>
  );
}

function HighlightModal({ meeting, item, onClose, reload }: { meeting: Meeting; item: Highlight | "new" | null; onClose: () => void; reload: () => void }) {
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
            <OptionSelect disabled={ro} options={acc.byKind("HIGHLIGHT_TYPE")} value={form.typeId} onChange={(v) => setForm({ ...form, typeId: v })} placeholder="Sans type" />
          </Field>
        </div>
        <Field label="Détail" hint="**gras** et puces « • » acceptés.">
          <textarea className="input" rows={6} disabled={ro} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
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
            <OptionSelect disabled={ro} options={acc.byKind("TOPIC_THEME")} value={form.themeId} onChange={(v) => setForm({ ...form, themeId: v })} />
          </Field>
          <Field label="Nature">
            <OptionSelect disabled={ro} options={acc.byKind("TOPIC_NATURE")} value={form.natureId} onChange={(v) => setForm({ ...form, natureId: v })} />
          </Field>
        </div>
        <Field label="Description" hint="**gras** et puces « • » acceptés.">
          <textarea className="input" rows={6} disabled={ro} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label={decisionLabel} hint="En séance, ajouter une ligne « Décision : … ».">
          <textarea className="input" rows={4} disabled={ro} value={form.decisionRequest} onChange={(e) => setForm({ ...form, decisionRequest: e.target.value })} />
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
