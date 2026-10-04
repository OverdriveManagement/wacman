"use client";

import { useState } from "react";
import { api, toast } from "@/lib/api";
import { BLOCK_LABELS, BLOCK_ORDER, type MeetingBlock, type MeetingType } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Field, Modal, Toggle } from "./ui";
import { RichField } from "./RichText";

/** Création ou modification d'un type de séance (depuis sa page, le menu ou les paramètres du compte). */

export function MeetingTypeModal({ item, onClose }: { item: MeetingType | "new" | null; onClose: () => void }) {
  const acc = useAcc();
  const blank = { name: "", emoji: "🗓️", frequency: "", description: "", guide: "", blocks: ["HIGHLIGHTS"] as MeetingBlock[], settings: {} as MeetingType["settings"], active: true };
  const init = item === "new" || !item ? blank : item;
  const [f, setF] = useState(init);
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setF(init);
  }
  const save = async () => {
    if (!f.name.trim() || !f.blocks.length) return toast("error", "Nom et au moins un bloc requis.");
    const data = { name: f.name, emoji: f.emoji, frequency: f.frequency, description: f.description, guide: f.guide, blocks: f.blocks, settings: f.settings, active: f.active };
    if (item === "new") await api(`${acc.base}/e/meetingType`, { method: "POST", json: { ...data, order: acc.data.meetingTypes.length + 1 } });
    else if (item) await api(`${acc.base}/e/meetingType/${item.id}`, { method: "PATCH", json: data });
    await acc.mutate();
    toast("success", "Type de séance enregistré.");
    onClose();
  };
  const st = f.settings ?? {};
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      wide
      title={item === "new" ? "Nouveau type de séance" : "Type de séance"}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[80px_1fr_1fr]">
          <Field label="Picto">
            <input className="input text-center" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
          </Field>
          <Field label="Nom">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Fréquence">
            <input className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })} />
          </Field>
        </div>
        <div>
          <div className="label">Blocs</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {BLOCK_ORDER.map((b) => (
              <label key={b} className="flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={f.blocks.includes(b)}
                  onChange={(e) => setF({ ...f, blocks: BLOCK_ORDER.filter((x) => (x === b ? e.target.checked : f.blocks.includes(x))) })}
                />
                {BLOCK_LABELS[b]}
              </label>
            ))}
          </div>
        </div>
        {f.blocks.includes("STREAM_STATUS") && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Libellé colonne statut">
              <input className="input" value={st.statusLabel ?? ""} placeholder="Statut" onChange={(e) => setF({ ...f, settings: { ...st, statusLabel: e.target.value } })} />
            </Field>
            <Field label="Libellé colonne avancement">
              <input className="input" value={st.progressLabel ?? ""} placeholder="Avancement" onChange={(e) => setF({ ...f, settings: { ...st, progressLabel: e.target.value } })} />
            </Field>
            <Field label="Libellé colonne alertes">
              <input className="input" value={st.alertsLabel ?? ""} placeholder="Alertes & prérequis" onChange={(e) => setF({ ...f, settings: { ...st, alertsLabel: e.target.value } })} />
            </Field>
          </div>
        )}
        {f.blocks.includes("TOPICS") && (
          <Field label="Libellé colonne arbitrage">
            <input className="input" value={st.decisionLabel ?? ""} placeholder="Arbitrage ou décision demandée" onChange={(e) => setF({ ...f, settings: { ...st, decisionLabel: e.target.value } })} />
          </Field>
        )}
        <Field label="Cadrage (affiché en tête de page)">
          <RichField rows={3} value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        </Field>
        <Field label="Mode d'emploi">
          <RichField rows={5} value={f.guide} onChange={(v) => setF({ ...f, guide: v })} />
        </Field>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Visible dans le menu" />
      </div>
    </Modal>
  );
}

