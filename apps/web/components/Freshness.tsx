"use client";

/**
 * Étiquette de fraîcheur des cartes : nombre de jours depuis la dernière modification du contenu,
 * avec un picto et une couleur par palier (paramétrables par un administrateur du compte).
 */

import { useState } from "react";
import { api, toast } from "@/lib/api";
import { COLORS, frDate, tone } from "@/lib/format";
import { DEFAULT_FRESHNESS, daysLabel, daysSince, freshnessError, freshnessLevel, rangeLabel } from "@/lib/freshness";
import type { Card, FreshnessSettings } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Modal, Toggle } from "./ui";
import { IconPlus, IconTrash } from "./icons";

export function useFreshness(): FreshnessSettings {
  const acc = useAcc();
  return acc.data.account.settings.freshness ?? DEFAULT_FRESHNESS;
}

/** Étiquette affichée sur une carte du kanban (rien si désactivée ou carte terminée selon le paramétrage). */
export function FreshnessTag({ card, force = false }: { card: Pick<Card, "contentUpdatedAt" | "updatedAt" | "statusId">; force?: boolean }) {
  const acc = useAcc();
  const f = useFreshness();
  const iso = card.contentUpdatedAt ?? card.updatedAt;
  const days = daysSince(iso);
  if (days === null || (!force && (!f.enabled || (f.hideDone && acc.isDone(card.statusId))))) return null;
  const { level } = freshnessLevel(days, f);
  return <FreshPill days={days} emoji={level.emoji} color={level.color} title={`Contenu modifié le ${frDate(new Date(iso).toISOString())}${days ? `, il y a ${days} jour${days > 1 ? "s" : ""}` : ", aujourd'hui"}${level.label ? ` (${level.label})` : ""}`} />;
}

function FreshPill({ days, emoji, color, title }: { days: number; emoji: string; color: string; title?: string }) {
  const c = tone[color] ?? tone.slate;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-px text-[0.66rem] font-semibold leading-4"
      style={{ color: c, background: `color-mix(in srgb, ${c} 13%, transparent)` }}
      title={title}
      data-testid="freshness"
    >
      {emoji && <span className="text-[0.62rem]">{emoji}</span>}
      {daysLabel(days)}
    </span>
  );
}

/** Éditeur des paliers (fenêtre du kanban en mode édition et page Paramètres). */
export function FreshnessEditor({ value: f, onChange }: { value: FreshnessSettings; onChange: (f: FreshnessSettings) => void }) {
  const setLevel = (i: number, patch: Partial<FreshnessSettings["levels"][number]>) => onChange({ ...f, levels: f.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const add = () => {
    const last = f.levels.length - 1;
    const prev = last > 0 ? (f.levels[last - 1].maxDays as number) : 0;
    const levels = [...f.levels];
    levels.splice(last, 0, { maxDays: prev + 7, emoji: "🟡", color: "ocre", label: "" });
    onChange({ ...f, levels });
  };
  const remove = (i: number) => {
    const levels = f.levels.filter((_, j) => j !== i);
    levels[levels.length - 1] = { ...levels[levels.length - 1], maxDays: null };
    onChange({ ...f, levels });
  };
  const err = freshnessError(f);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Toggle checked={f.enabled} onChange={(v) => onChange({ ...f, enabled: v })} label="Afficher l'étiquette sur les cartes du kanban" />
        <Toggle checked={f.hideDone} onChange={(v) => onChange({ ...f, hideDone: v })} label="Masquer l'étiquette sur les cartes terminées" />
      </div>
      <div className="space-y-2">
        {f.levels.map((l, i) => {
          const last = i === f.levels.length - 1;
          return (
            <div key={i} className="rounded-xl border border-line-soft p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <input className="input !w-12 text-center" maxLength={8} value={l.emoji} onChange={(e) => setLevel(i, { emoji: e.target.value })} aria-label={`Picto du palier ${i + 1}`} />
                <input className="input min-w-0 flex-1" maxLength={40} value={l.label} placeholder="Libellé (facultatif)" onChange={(e) => setLevel(i, { label: e.target.value })} aria-label={`Libellé du palier ${i + 1}`} />
                {last ? (
                  <span className="text-sm text-muted">au-delà</span>
                ) : (
                  <label className="flex items-center gap-1.5 text-sm text-ink-2">
                    jusqu'à
                    <input
                      type="number"
                      min={0}
                      className="input !w-16 text-center"
                      value={l.maxDays ?? ""}
                      onChange={(e) => setLevel(i, { maxDays: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })}
                      aria-label={`Nombre de jours du palier ${i + 1}`}
                    />
                    j
                  </label>
                )}
                {f.levels.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm !px-1.5 text-muted" onClick={() => remove(i)} aria-label={`Supprimer le palier ${i + 1}`}>
                    <IconTrash width={14} height={14} />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setLevel(i, { color: c })}
                    className={`h-5 w-5 rounded-full border-2 transition ${l.color === c ? "scale-110 border-ink" : "border-transparent"}`}
                    style={{ background: tone[c] }}
                    aria-label={`Couleur ${c}`}
                    title={c}
                  />
                ))}
                <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                  {!err && rangeLabel(f.levels, i)}
                  <FreshPill days={l.maxDays ?? (i > 0 ? ((f.levels[i - 1].maxDays as number) ?? 0) + 1 : 0)} emoji={l.emoji} color={l.color} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {f.levels.length < 6 && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={add}>
          <IconPlus /> Ajouter un palier
        </button>
      )}
      {err && <p className="text-sm text-red">{err}</p>}
      <p className="text-xs text-muted">
        Le compteur repart à zéro dès qu'une carte est modifiée : texte, statut, stream, porteur, sprint, dates, avancement. Un simple réordonnancement dans une colonne ou la bascule automatique de sprint ne
        compte pas.
      </p>
    </div>
  );
}

/** Fenêtre de paramétrage ouverte depuis le kanban (mode édition). */
export function FreshnessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const acc = useAcc();
  const current = useFreshness();
  const [f, setF] = useState<FreshnessSettings>(current);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setF(current);
  }
  const save = async () => {
    setBusy(true);
    try {
      await api(acc.base, { method: "PATCH", json: { settings: { freshness: f } } });
      await acc.mutate();
      toast("success", "Paliers de fraîcheur enregistrés.");
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fraîcheur des cartes"
      footer={
        <>
          <button className="btn btn-ghost mr-auto" onClick={() => setF(DEFAULT_FRESHNESS)}>
            Valeurs par défaut
          </button>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={busy || !!freshnessError(f)} onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-2">Chaque carte indique depuis combien de jours son contenu n'a pas été modifié. Picto et couleur changent selon les paliers ci-dessous.</p>
      <FreshnessEditor value={f} onChange={setF} />
    </Modal>
  );
}
