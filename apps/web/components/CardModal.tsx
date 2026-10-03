"use client";

import { useEffect, useState } from "react";
import { api, toast } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Card } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Comments, History } from "./Comments";
import { Field, InlineText, Modal, OptionSelect, Pill, useConfirm } from "./ui";
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Statut">
          <OptionSelect disabled={ro} options={acc.byKind("CARD_STATUS")} value={c.statusId} onChange={(v) => save({ statusId: v })} placeholder="Sans statut" />
        </Field>
        <Field label="Stream">
          <OptionSelect disabled={ro} options={streams} value={c.streamId} onChange={(v) => save({ streamId: v })} />
        </Field>
        <Field label="Porteur">
          <OptionSelect disabled={ro} options={contacts} value={c.ownerId} onChange={(v) => save({ ownerId: v })} />
        </Field>
        <Field label="Sprint">
          <OptionSelect disabled={ro} options={sprints} value={c.sprintId} onChange={(v) => save({ sprintId: v })} />
        </Field>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vigilance / Alerte">
            <OptionSelect disabled={ro} options={acc.byKind("ALERT_LEVEL")} value={c.alertLevelId} onChange={(v) => save({ alertLevelId: v })} placeholder="Ni vigilance ni alerte" />
          </Field>
          <Field label="Échéance">
            <input className="input" type="date" disabled={ro} value={c.dueDate ?? ""} onChange={(e) => save({ dueDate: e.target.value || null })} />
          </Field>
        </div>
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
            <Field label="Mis à jour">
              <div className="py-2 text-sm text-ink-2">{dateTime(c.updatedAt)}</div>
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

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}
