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
  ["sprintReview", "Bilan du sprint"],
  ["livrables", "Les livrables du sprint (deux streams par slide)"],
  ["kanban", "Livrables du sprint, une slide par stream (format compact)"],
  ["highlights", "Faits marquants des séances retenues"],
  ["meteo", "Actions en cours des streams (météo)"],
  ["focus", "Focus stream"],
  ["expectations", "Ce que nous attendons du client"],
  ["coproj", "Avancement des streams, alertes et prérequis (cartes COPROJ)"],
  ["statuses", "Statut des streams en tableau"],
  ["topics", "Sujets des séances"],
  ["alerts", "Cartes en vigilance ou en alerte"],
  ["decisions", "Registre des décisions"],
  ["actions", "Relevé des actions"],
  ["planning", "Planning des livrables (Gantt)"],
] as const;
/** sections qui s'appuient sur les séances retenues */
const MEETING_SECTIONS = ["highlights", "coproj", "statuses", "topics", "decisions", "actions"];

type Preset = { id: string; label: string; hint: string; sections: string[]; match?: (t: MeetingType) => boolean; name: string };
const PRESETS: Preset[] = [
  {
    id: "weekly",
    label: "Program weekly",
    hint: "Livrables, faits marquants, météo, focus stream, attentes client, alertes, actions, planning",
    sections: ["cover", "livrables", "highlights", "meteo", "focus", "expectations", "alerts", "actions", "planning"],
    match: (t) => /weekly|hebdo/i.test(t.name),
    name: "program-weekly",
  },
  {
    id: "coproj",
    label: "COPROJ",
    hint: "Avancement des streams en cartes, sujets, décisions, actions, attentes client",
    sections: ["cover", "coproj", "topics", "decisions", "actions", "expectations"],
    match: (t) => /coproj/i.test(t.name),
    name: "coproj",
  },
  { id: "sprint", label: "Bilan de sprint", hint: "Une slide de bilan, puis les livrables et les décisions", sections: ["sprintReview", "livrables", "decisions"], name: "bilan-sprint" },
  { id: "custom", label: "Personnalisé", hint: "Choisissez les sections", sections: [], name: "program-management" },
];

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

export function ExportDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { preset?: string; meetingId?: string; typeId?: string } }) {
  const acc = useAcc();
  const [tab, setTab] = useState<"pptx" | "xlsx">("pptx");
  const [sprintId, setSprintId] = useState(acc.currentSprint?.id ?? "");
  const [preset, setPreset] = useState("weekly");
  const [sections, setSections] = useState<string[]>(PRESETS[0].sections);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const types = acc.data.meetingTypes.filter((m) => m.active);
  const streams = acc.data.streams.filter((s) => s.active && s.inKanban);

  /** applique un modèle : sections et séances retenues (la dernière séance du type correspondant) */
  const apply = (id: string, keep?: { meetingId?: string; typeId?: string }) => {
    const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
    setPreset(p.id);
    if (p.id !== "custom") setSections(p.sections);
    if (p.match || keep?.typeId) {
      const next: Record<string, string> = {};
      for (const t of types) next[t.id] = keep?.typeId === t.id ? (keep.meetingId ?? "auto") : !keep?.typeId && p.match?.(t) ? "auto" : "";
      setPicked(next);
    }
  };
  // ouverture depuis une séance : modèle et séance présélectionnés
  const [seen, setSeen] = useState(false);
  if (open && !seen) {
    setSeen(true);
    if (initial?.preset || initial?.typeId) apply(initial.preset ?? "weekly", { meetingId: initial.meetingId, typeId: initial.typeId });
    else apply("weekly");
  }
  if (!open && seen) setSeen(false);

  const pptx = async () => {
    setBusy(true);
    try {
      const meetings = types.map((t) => picked[t.id]).filter((v) => v && v !== "auto");
      const qs = new URLSearchParams({
        sections: sections.join(","),
        ...(sprintId ? { sprintId } : {}),
        meetings: meetings.join(",") || "none",
        ...(sections.includes("focus") && focus.length ? { focus: focus.join(",") } : {}),
        name: PRESETS.find((p) => p.id === preset)?.name ?? "program-management",
      });
      await download(`${acc.base}/export/deck.pptx?${qs}`);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (k: string, on: boolean) => {
    setPreset("custom");
    setSections((cur) => (on ? SECTIONS.map((x) => x[0] as string).filter((x) => x === k || cur.includes(x)) : cur.filter((x) => x !== k)));
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
            <div className="label">Modèle</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => apply(p.id)} className={`rounded-xl border p-2.5 text-left transition ${preset === p.id ? "border-accent bg-accent/10" : "border-line-soft hover:bg-surface-2"}`} aria-pressed={preset === p.id}>
                  <div className="text-sm font-semibold text-ink">{p.label}</div>
                  <div className="text-[0.72rem] text-muted">{p.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <details className="rounded-xl border border-line-soft px-3 py-2" open={preset === "custom"}>
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">Sections ({sections.length})</summary>
            <div className="mt-2 space-y-1.5">
              {SECTIONS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-ink-2">
                  <input type="checkbox" checked={sections.includes(k)} onChange={(e) => toggle(k, e.target.checked)} />
                  {l}
                </label>
              ))}
            </div>
          </details>
          {sections.includes("focus") && (
            <div>
              <div className="label">Streams du focus</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {streams.map((st) => (
                  <label key={st.id} className="flex items-center gap-1.5 text-sm text-ink-2">
                    <input type="checkbox" checked={focus.includes(st.id)} onChange={(e) => setFocus((f) => (e.target.checked ? [...f, st.id] : f.filter((x) => x !== st.id)))} />
                    {st.emoji} {st.name}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[0.7rem] text-muted">Aucun coché : un focus par stream ayant des cartes dans le sprint.</p>
            </div>
          )}
          {sections.some((x) => MEETING_SECTIONS.includes(x)) && (
            <div>
              <div className="label">Séances retenues</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {types.map((t) => (
                  <MeetingPicker key={t.id} type={t} value={picked[t.id] ?? "auto"} onChange={(v) => setPicked((p) => ({ ...p, [t.id]: v }))} />
                ))}
              </div>
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
