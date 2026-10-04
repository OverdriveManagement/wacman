"use client";

import { FreshnessTag } from "./Freshness";
import { useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { dateTime, todayIso } from "@/lib/format";
import type { Card } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { DateTag, TagSelect } from "./Tag";
import { useCreators } from "@/lib/hooks";
import { Comments, History } from "./Comments";
import { Field, InlineText, Modal, Pill, useConfirm } from "./ui";
import { IconCopy, IconTrash } from "./icons";

/** Fiche d'un livrable : en-tête (statut, stream, porteur, sprint), corps, détails, commentaires et historique. */
export function CardModal({
  card,
  onClose,
  onChanged,
  onDuplicated,
}: {
  card: Card | null;
  onClose: () => void;
  onChanged: (c?: Card, removed?: boolean) => void;
  onDuplicated?: (c: Card) => void;
}) {
  const acc = useAcc();
  const [c, setC] = useState<Card | null>(card);
  const [tab, setTab] = useState<"comments" | "history">("comments");
  const [histKey, setHistKey] = useState(0);
  const confirm = useConfirm();
  const create = useCreators(acc);
  useEffect(() => setC(card), [card]);
  if (!c) return null;
  const ro = !acc.canEdit;

  const save = async (patch: Partial<Card>) => {
    const updated = await api<Card>(`${acc.base}/e/card/${c.id}`, { method: "PATCH", json: patch });
    setC({ ...c, ...updated });
    setHistKey((k) => k + 1);
    onChanged({ ...c, ...updated });
  };

  const sprints = acc.data.sprints.map((s) => ({ id: s.id, label: `${s.name}${s.state === "CURRENT" ? " (en cours)" : ""}` }));
  const streams = acc.data.streams.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }));
  const contacts = acc.data.contacts.map((p) => ({ id: p.id, label: p.name }));
  const alert = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;

  return (
    <Modal
      open={!!card}
      onClose={onClose}
      wide
      title={
        <div className="flex items-start gap-2">
          <span className="mt-1 shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-sans text-[0.7rem] font-semibold text-muted">Réf. {c.ref}</span>
          <InlineText value={c.title} disabled={ro} onSave={(v) => (v.trim() ? save({ title: v.trim() }) : toast("error", "Le titre est obligatoire."))} render={(v) => <span>{c.emoji ? `${c.emoji} ` : ""}{v}</span>} className="flex-1" />
        </div>
      }
    >
      {/* propriétés : étiquettes cliquables, sans cadre de liste */}
      <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
        <Prop label="Statut">
          <TagSelect label="Statut" disabled={ro} allowClear={false} options={acc.byKind("CARD_STATUS")} value={c.statusId} onChange={(v) => save({ statusId: v })} onCreate={create.option("CARD_STATUS")} createLabel="Nouvelle colonne…" />
        </Prop>
        <Prop label="Vigilance / Alerte">
          <TagSelect label="Vigilance ou alerte" disabled={ro} options={acc.byKind("ALERT_LEVEL")} value={c.alertLevelId} onChange={(v) => save({ alertLevelId: v })} />
        </Prop>
        <Prop label="Stream">
          <TagSelect label="Stream" variant="text" className="text-sm text-ink" disabled={ro} options={streams} value={c.streamId} onChange={(v) => save({ streamId: v })} onCreate={create.stream} createLabel="Nouveau stream…" />
        </Prop>
        <Prop label="Porteur">
          <TagSelect label="Porteur" variant="text" className="text-sm text-ink" disabled={ro} options={contacts} value={c.ownerId} onChange={(v) => save({ ownerId: v })} onCreate={create.contact} createLabel="Nouveau contact…" />
        </Prop>
        <Prop label="Sprint">
          <TagSelect label="Sprint" variant="text" className="text-sm text-ink" disabled={ro} options={sprints} value={c.sprintId} onChange={(v) => save({ sprintId: v })} />
        </Prop>
        <Prop label="Dates">
          <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <DateTag label="Début prévu" disabled={ro} value={c.startDate} max={c.dueDate} onChange={(v) => (v && c.dueDate && v > c.dueDate ? toast("error", "Le début prévu doit précéder l'échéance.") : save({ startDate: v }))} />
            {!c.startDate && c.sprintId && !ro && <span className="text-[0.7rem]">début</span>}
            <span>au</span>
            <DateTag
              label="Échéance"
              disabled={ro}
              value={c.dueDate}
              min={c.startDate}
              danger={!!c.dueDate && c.dueDate < todayIso() && !acc.isDone(c.statusId)}
              onChange={(v) => (v && c.startDate && v < c.startDate ? toast("error", "L'échéance doit suivre le début prévu.") : save({ dueDate: v }))}
            />
            {!c.dueDate && !ro && <span className="text-[0.7rem]">échéance</span>}
          </span>
        </Prop>
      </div>

      <div className="mt-5 space-y-4">
        <Block label="Description">
          <InlineText multiline disabled={ro} value={c.description} onSave={(v) => save({ description: v })} className="text-sm text-ink-2" />
        </Block>
        <Block label="Point d'avancement">
          <InlineText multiline disabled={ro} value={c.progressNote} onSave={(v) => save({ progressNote: v })} className="text-sm text-ink-2" />
        </Block>
        <Block label="Prochaines étapes">
          <InlineText multiline disabled={ro} value={c.nextSteps} onSave={(v) => save({ nextSteps: v })} className="text-sm text-ink-2" />
        </Block>
        <div
          className="rounded-xl border p-3"
          style={alert ? { borderColor: `color-mix(in srgb, var(--${alert.color === "red" ? "red" : "amber"}) 45%, transparent)`, background: `color-mix(in srgb, var(--${alert.color === "red" ? "red" : "amber"}) 7%, transparent)` } : { borderColor: "var(--border-soft)" }}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="label !mb-0">Alertes / arbitrages</span>
            {alert && <Pill option={alert} small />}
          </div>
          <InlineText
            multiline
            disabled={ro}
            value={c.alertsNote}
            onSave={(v) => save({ alertsNote: v })}
            className="text-sm text-ink-2"
            placeholder="À renseigner pour une carte en vigilance ou en alerte ; sinon, les actions vont dans Prochaines étapes."
          />
        </div>

        <details className="rounded-xl border border-line-soft px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2">Détails</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Avancement (%)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                disabled={ro}
                defaultValue={c.progressPct ?? ""}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value)));
                  if (v !== c.progressPct) save({ progressPct: v });
                }}
              />
            </Field>
            <Field label="Picto">
              <input className="input" maxLength={8} disabled={ro} defaultValue={c.emoji} onBlur={(e) => e.target.value !== c.emoji && save({ emoji: e.target.value })} placeholder="ex. 🚀" />
            </Field>
            <Field label="Contenu modifié">
              <div className="flex items-center gap-2 py-2 text-sm text-ink-2">
                {dateTime(c.contentUpdatedAt ?? c.updatedAt)}
                <FreshnessTag card={c} force />
              </div>
            </Field>
          </div>
          <div className="mt-2 text-xs text-muted">
            Créée le {new Date(c.createdAt).toLocaleDateString("fr-FR")}. Réf. {c.ref}.
          </div>
          {acc.canEdit && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onDuplicated && (
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    const copy = await api<Card>(`${acc.base}/cards/${c.id}/duplicate`, { method: "POST" });
                    toast("success", `Carte dupliquée : réf. ${copy.ref}.`);
                    onDuplicated(copy);
                  }}
                >
                  <IconCopy width={14} height={14} /> Dupliquer
                </button>
              )}
              <button className="btn btn-sm" onClick={() => save({ archived: !c.archived })}>
                {c.archived ? "Désarchiver" : "Archiver la carte"}
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() =>
                  confirm.ask("Supprimer la carte", `La carte « ${c.title} » sera supprimée définitivement, avec ses commentaires.`, async () => {
                    await api(`${acc.base}/e/card/${c.id}`, { method: "DELETE" });
                    toast("success", "Carte supprimée.");
                    onChanged(c, true);
                    onClose();
                  })
                }
              >
                <IconTrash width={14} height={14} /> Supprimer
              </button>
            </div>
          )}
        </details>

        <div className="border-t border-line-soft pt-3">
          <div className="mb-3 flex gap-1">
            <button className={`btn btn-sm ${tab === "comments" ? "" : "btn-ghost"}`} onClick={() => setTab("comments")}>
              Commentaires
            </button>
            <button className={`btn btn-sm ${tab === "history" ? "" : "btn-ghost"}`} onClick={() => setTab("history")}>
              Historique
            </button>
          </div>
          {tab === "comments" ? (
            <Comments entityType="card" entityId={c.id} onCount={(n) => onChanged({ ...c, commentCount: n })} />
          ) : (
            <History key={histKey} entityType="card" entityId={c.id} />
          )}
        </div>
      </div>
      {confirm.node}
    </Modal>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[26px] items-center gap-3">
      <span className="w-32 shrink-0 text-xs font-semibold text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}
