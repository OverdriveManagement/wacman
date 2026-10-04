"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { download, fetcher } from "@/lib/api";
import { frDate } from "@/lib/format";
import type { Meeting, MeetingType } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Field, Modal } from "./ui";
import { IconDownload } from "./icons";

const SECTIONS = [
  ["cover", "Couverture"],
  ["meetings", "Séances sélectionnées (faits marquants, statut des streams, sujets)"],
  ["alerts", "Cartes en vigilance ou en alerte"],
  ["kanban", "Livrables du sprint, une slide par stream"],
  ["planning", "Planning des livrables (Gantt par stream)"],
] as const;

function MeetingPicker({ type, value, onChange }: { type: MeetingType; value: string; onChange: (v: string) => void }) {
  const acc = useAcc();
  const { data } = useSWR<Meeting[]>(`${acc.base}/meetings?typeId=${type.id}`, fetcher);
  useEffect(() => {
    if (data && value === "auto") onChange(data[0]?.id ?? "");
  }, [data, value, onChange]);
  return (
    <Field label={`${type.emoji} ${type.name}`}>
      <select className="input" value={value === "auto" ? "" : value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Ne pas inclure</option>
        {(data ?? []).map((m) => (
          <option key={m.id} value={m.id}>
            Séance du {frDate(m.date)}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const acc = useAcc();
  const [tab, setTab] = useState<"pptx" | "xlsx">("pptx");
  const [sprintId, setSprintId] = useState(acc.currentSprint?.id ?? "");
  const [sections, setSections] = useState<string[]>(SECTIONS.map((s) => s[0]));
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const types = acc.data.meetingTypes.filter((m) => m.active);

  const pptx = async () => {
    setBusy(true);
    try {
      const meetings = types.map((t) => picked[t.id]).filter((v) => v && v !== "auto");
      const qs = new URLSearchParams({ sections: sections.join(","), ...(sprintId ? { sprintId } : {}), meetings: meetings.join(",") || "none" });
      await download(`${acc.base}/export/deck.pptx?${qs}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exporter"
      wide
      footer={
        tab === "pptx" && (
          <button className="btn btn-primary" disabled={busy || !sections.length} onClick={pptx}>
            <IconDownload /> {busy ? "Génération…" : "Télécharger le PowerPoint"}
          </button>
        )
      }
    >
      <div className="mb-4 flex gap-1">
        <button className={`btn btn-sm ${tab === "pptx" ? "btn-primary" : ""}`} onClick={() => setTab("pptx")}>
          PowerPoint
        </button>
        <button className={`btn btn-sm ${tab === "xlsx" ? "btn-primary" : ""}`} onClick={() => setTab("xlsx")}>
          Excel
        </button>
      </div>
      {tab === "pptx" ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Slides au gabarit Wifirst (16:9, Hind Madurai et Inter), prêtes à reprendre dans le deck Program weekly ou COPROJ.</p>
          <Field label="Sprint">
            <select className="input" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              {acc.data.sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.state === "CURRENT" ? " (en cours)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <div className="label">Sections</div>
            <div className="space-y-1.5">
              {SECTIONS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" checked={sections.includes(k)} onChange={(e) => setSections(e.target.checked ? [...sections, k] : sections.filter((x) => x !== k))} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          {sections.includes("meetings") && (
            <div className="grid gap-3 sm:grid-cols-2">
              {types.map((t) => (
                <MeetingPicker key={t.id} type={t} value={picked[t.id] ?? "auto"} onChange={(v) => setPicked((p) => ({ ...p, [t.id]: v }))} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="card flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <div className="font-semibold text-ink">Cartes</div>
              <div className="text-xs text-muted">Tous les champs, avec filtre et en-têtes figés.</div>
            </div>
            <div className="flex gap-2">
              {acc.currentSprint && (
                <button className="btn btn-sm" onClick={() => download(`${acc.base}/export/cards.xlsx?sprintId=${acc.currentSprint!.id}`)}>
                  {acc.currentSprint.name}
                </button>
              )}
              <button className="btn btn-sm" onClick={() => download(`${acc.base}/export/cards.xlsx`)}>
                Tous les sprints
              </button>
            </div>
          </div>
          {types.filter((t) => t.blocks.some((b) => b === "HIGHLIGHTS" || b === "STREAM_STATUS" || b === "TOPICS")).map((t) => (
            <div key={t.id} className="card flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <div className="font-semibold text-ink">
                  {t.emoji} {t.name}
                </div>
                <div className="text-xs text-muted">Toutes les séances, une ligne par élément.</div>
              </div>
              <button className="btn btn-sm" onClick={() => download(`${acc.base}/export/meetings.xlsx?typeId=${t.id}`)}>
                <IconDownload /> Excel
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
