"use client";

/**
 * Relevé des actions et registre des décisions : listes éditables en place, réutilisées
 * dans les séances (blocs ACTIONS et DECISIONS) et sur la page « Actions & décisions ».
 */

import useSWR from "swr";
import { useState } from "react";
import { api, fetcher, toast } from "@/lib/api";
import { frDate, isOverdue } from "@/lib/format";
import { partyOptions } from "@/lib/followup";
import type { Action, ActionParty, Decision } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { DateTag, TagSelect } from "./Tag";
import { InlineText, useConfirm, useSubmit } from "./ui";
import { Menu } from "./config";
import { useCreators } from "@/lib/hooks";

export function useActions() {
  const acc = useAcc();
  return useSWR<Action[]>(`${acc.base}/e/action`, fetcher);
}
export function useDecisions() {
  const acc = useAcc();
  return useSWR<Decision[]>(`${acc.base}/e/decision`, fetcher);
}

const patch = (base: string, entity: string, id: string, json: unknown) => api(`${base}/e/${entity}/${id}`, { method: "PATCH", json });

function useStreamOptions() {
  const acc = useAcc();
  return acc.data.streams.map((s) => ({ id: s.id, label: s.active ? s.name : `${s.name} (inactif)`, emoji: s.emoji, hidden: !s.active }));
}

/** Ajout rapide : un champ, Entrée crée l'élément et laisse le champ ouvert pour enchaîner. */
function QuickAdd({ placeholder, onAdd, label }: { placeholder: string; onAdd: (title: string) => Promise<unknown>; label: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [add] = useSubmit(async () => {
    const t = draft.trim();
    if (!t) return;
    await onAdd(t);
    setDraft("");
  });
  if (!open)
    return (
      <button className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-accent" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  return (
    <input
      className="input mt-2"
      autoFocus
      placeholder={placeholder}
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.repeat) add();
        if (e.key === "Escape") (e.stopPropagation(), setOpen(false), setDraft(""));
      }}
      onBlur={() => !draft.trim() && setOpen(false)}
    />
  );
}

// ---------------------------------------------------------------------------
// Relevé des actions
// ---------------------------------------------------------------------------

export function ActionsList({
  actions,
  defaults,
  onChanged,
  showSeries = false,
  emptyText = "Aucune action.",
  allowAdd = true,
}: {
  actions: Action[];
  defaults: Partial<Pick<Action, "meetingTypeId" | "meetingId" | "streamId" | "party">>;
  onChanged: () => void;
  showSeries?: boolean;
  emptyText?: string;
  allowAdd?: boolean;
}) {
  const acc = useAcc();
  const ro = !acc.canEdit;
  const confirm = useConfirm();
  const streams = useStreamOptions();
  const create = useCreators(acc);
  const contacts = acc.data.contacts.map((c) => ({ id: c.id, label: c.name }));
  const parties = partyOptions(acc);
  const series = acc.data.meetingTypes.map((t) => ({ id: t.id, label: t.name, emoji: t.emoji }));
  const save = async (a: Action, data: Partial<Action>) => {
    await patch(acc.base, "action", a.id, data);
    onChanged();
  };
  const add = async (title: string) => {
    await api(`${acc.base}/e/action`, { method: "POST", json: { title, party: "WIFIRST", ...defaults, order: Math.max(0, ...actions.map((a) => a.order)) + 1 } });
    onChanged();
  };
  return (
    <div>
      {!actions.length && <p className="text-sm text-muted">{emptyText}</p>}
      {actions.length > 0 && (
        <div className="divide-y divide-line-soft rounded-xl border border-line-soft">
          {actions.map((a, i) => {
            const closed = a.status !== "OPEN";
            const late = !closed && isOverdue(a.dueDate);
            return (
              <div key={a.id} data-action-id={a.id} className={`group grid grid-cols-[22px_1fr_auto] items-start gap-x-2 gap-y-1 px-3 py-2 md:grid-cols-[22px_22px_110px_1fr_150px_140px_80px_28px] ${closed ? "opacity-60" : ""}`}>
                <input
                  type="checkbox"
                  className="mt-1.5 h-4 w-4 accent-[var(--teal)]"
                  checked={a.status === "DONE"}
                  disabled={ro || a.status === "CANCELLED"}
                  onChange={(e) => save(a, { status: e.target.checked ? "DONE" : "OPEN" })}
                  aria-label={a.status === "DONE" ? "Rouvrir l'action" : "Marquer l'action comme faite"}
                />
                <span className="mt-1 hidden text-xs text-muted md:block">{i + 1}</span>
                <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-1.5 md:col-start-auto md:row-start-auto md:mt-0.5">
                  <TagSelect label="Porteur" disabled={ro} allowClear={false} options={parties} value={a.party} onChange={(v) => v && save(a, { party: v as ActionParty })} />
                </div>
                <div className="col-start-2 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
                  <InlineText
                    disabled={ro}
                    value={a.title}
                    onSave={(v) => (v.trim() ? save(a, { title: v.trim() }) : toast("error", "L'intitulé est obligatoire."))}
                    render={(v) => <span className={`text-sm text-ink [overflow-wrap:anywhere] ${a.status === "CANCELLED" ? "line-through" : a.status === "DONE" ? "line-through decoration-teal" : ""}`}>{v}</span>}
                  />
                  {showSeries && (
                    <div className="mt-0.5 text-[0.7rem] text-muted">
                      <TagSelect label="Série de séances" variant="text" className="text-[0.7rem] text-muted" disabled={ro} options={series} value={a.meetingTypeId} onChange={(v) => save(a, { meetingTypeId: v })} />
                    </div>
                  )}
                </div>
                <div className="col-start-2 row-start-3 flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
                  <div className="md:mt-0.5">
                    <TagSelect label="Stream" variant="text" className="text-xs font-semibold text-ocre" disabled={ro} options={streams} value={a.streamId} onChange={(v) => save(a, { streamId: v })} onCreate={create.stream} createLabel="Nouveau stream…" />
                  </div>
                  <div className="md:mt-0.5">
                    <TagSelect label="Porteur nominatif" variant="text" className="text-xs text-ink-2" disabled={ro} options={contacts} value={a.ownerId} onChange={(v) => save(a, { ownerId: v })} onCreate={create.contact} createLabel="Nouveau contact…" />
                  </div>
                  <div className="md:mt-0.5">
                    <DateTag label="Échéance" disabled={ro} value={a.dueDate} danger={late} onChange={(v) => save(a, { dueDate: v })} />
                  </div>
                </div>
                <div className="col-start-3 row-start-1 md:col-start-auto md:row-start-auto">
                  {!ro && (
                    <Menu
                      label="Options de l'action"
                      className="opacity-60 group-hover:opacity-100"
                      items={[
                        a.status === "OPEN" ? { label: "Abandonner l'action", onClick: () => save(a, { status: "CANCELLED" }) } : { label: "Rouvrir l'action", onClick: () => save(a, { status: "OPEN" }) },
                        "sep",
                        {
                          label: "Supprimer",
                          danger: true,
                          onClick: () =>
                            confirm.ask("Supprimer l'action", `« ${a.title.slice(0, 80)} » sera supprimée du relevé.`, async () => {
                              await api(`${acc.base}/e/action/${a.id}`, { method: "DELETE" });
                              onChanged();
                            }),
                        },
                      ]}
                    />
                  )}
                </div>
                {a.closedAt && closed && <div className="col-start-2 text-[0.68rem] text-muted md:col-span-6 md:col-start-4">{a.status === "DONE" ? "Faite" : "Abandonnée"} le {frDate(a.closedAt.slice(0, 10))}</div>}
              </div>
            );
          })}
        </div>
      )}
      {!ro && allowAdd && <QuickAdd label="Ajouter une action" placeholder="Intitulé de l'action, puis Entrée (porteur, stream et échéance ensuite)" onAdd={add} />}
      {confirm.node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registre des décisions
// ---------------------------------------------------------------------------

export function DecisionsList({
  decisions,
  defaults,
  onChanged,
  showSeries = false,
  emptyText = "Aucune décision.",
  status,
}: {
  decisions: Decision[];
  defaults: Partial<Pick<Decision, "meetingTypeId" | "meetingId" | "decidedOn" | "streamId">>;
  onChanged: () => void;
  showSeries?: boolean;
  emptyText?: string;
  /** statut des décisions ajoutées depuis cette liste */
  status: Decision["status"];
}) {
  const acc = useAcc();
  const ro = !acc.canEdit;
  const confirm = useConfirm();
  const streams = useStreamOptions();
  const series = acc.data.meetingTypes.map((t) => ({ id: t.id, label: t.name, emoji: t.emoji }));
  const statuses = [
    { id: "PENDING", label: "Attendue", color: "amber" },
    { id: "TAKEN", label: "Prise", color: "teal" },
  ];
  const save = async (d: Decision, data: Partial<Decision>) => {
    await patch(acc.base, "decision", d.id, data);
    onChanged();
  };
  const add = async (title: string) => {
    await api(`${acc.base}/e/decision`, {
      method: "POST",
      json: { title, status, ...defaults, decidedOn: status === "TAKEN" ? (defaults.decidedOn ?? null) : null, order: Math.max(0, ...decisions.map((d) => d.order)) + 1 },
    });
    onChanged();
  };
  return (
    <div>
      {!decisions.length && <p className="text-sm text-muted">{emptyText}</p>}
      {decisions.length > 0 && (
        <div className="divide-y divide-line-soft rounded-xl border border-line-soft">
          {decisions.map((d) => {
            const topic = d.topicId ? "lié à un sujet de séance" : "";
            return (
              <div key={d.id} data-decision-id={d.id} className="group grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2 md:grid-cols-[90px_1fr_150px_90px_28px]">
                <div className="row-start-2 md:row-start-auto md:mt-0.5">
                  <TagSelect
                    label="Statut de la décision"
                    disabled={ro}
                    allowClear={false}
                    options={statuses}
                    value={d.status}
                    onChange={(v) => v && save(d, v === "TAKEN" ? { status: "TAKEN", decidedOn: d.decidedOn ?? defaults.decidedOn ?? new Date().toISOString().slice(0, 10), meetingId: d.meetingId ?? defaults.meetingId ?? null } : { status: "PENDING" })}
                  />
                </div>
                <div className="row-start-1 min-w-0 md:row-start-auto">
                  <InlineText disabled={ro} value={d.title} onSave={(v) => (v.trim() ? save(d, { title: v.trim() }) : toast("error", "L'intitulé est obligatoire."))} render={(v) => <span className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{v}</span>} />
                  <InlineText multiline disabled={ro} value={d.detail} onSave={(v) => save(d, { detail: v })} className="text-xs text-ink-2" placeholder="Précisions…" />
                  {(showSeries || topic) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.7rem] text-muted">
                      {showSeries && <TagSelect label="Instance" variant="text" className="text-[0.7rem] text-muted" disabled={ro} options={series} value={d.meetingTypeId} onChange={(v) => save(d, { meetingTypeId: v })} />}
                      {topic && <span>{topic}</span>}
                    </div>
                  )}
                </div>
                <div className="col-start-1 row-start-3 flex flex-wrap items-center gap-3 md:contents">
                  <div className="md:mt-0.5">
                    <TagSelect label="Stream" variant="text" className="text-xs font-semibold text-ocre" disabled={ro} options={streams} value={d.streamId} onChange={(v) => save(d, { streamId: v })} />
                  </div>
                  <div className="md:mt-0.5">
                    <DateTag label={d.status === "TAKEN" ? "Date de la décision" : "Attendue pour le"} disabled={ro} value={d.decidedOn} onChange={(v) => save(d, { decidedOn: v })} />
                  </div>
                </div>
                <div className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
                  {!ro && (
                    <Menu
                      label="Options de la décision"
                      className="opacity-60 group-hover:opacity-100"
                      items={[
                        {
                          label: "Supprimer",
                          danger: true,
                          onClick: () =>
                            confirm.ask("Supprimer la décision", `« ${d.title.slice(0, 80)} » sera supprimée du registre.`, async () => {
                              await api(`${acc.base}/e/decision/${d.id}`, { method: "DELETE" });
                              onChanged();
                            }),
                        },
                      ]}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!ro && (
        <QuickAdd
          label={status === "TAKEN" ? "Consigner une décision prise" : "Ajouter une décision attendue"}
          placeholder={status === "TAKEN" ? "Décision prise, puis Entrée" : "Décision à faire trancher, puis Entrée"}
          onAdd={add}
        />
      )}
      {confirm.node}
    </div>
  );
}
