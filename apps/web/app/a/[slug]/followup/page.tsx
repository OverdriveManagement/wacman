"use client";

import { useMemo, useState } from "react";
import { useAcc } from "@/components/AccountContext";
import { ActionsList, DecisionsList, useActions, useDecisions } from "@/components/FollowUp";
import { WorkshopImport } from "@/components/WorkshopImport";
import { OptionSelect, Spinner } from "@/components/ui";
import { partyOptions } from "@/lib/followup";
import type { Action, Decision } from "@/lib/types";

type Tab = "actions" | "decisions";

/**
 * Relevé des actions et registre des décisions du compte, toutes séances confondues :
 * filtres par statut, côté porteur, stream et série de séances ; import d'un compte rendu d'atelier.
 */
export default function FollowUpPage() {
  const acc = useAcc();
  const [tab, setTab] = useState<Tab>("actions");
  const [q, setQ] = useState("");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [party, setParty] = useState<string | null>(null);
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [dstate, setDstate] = useState<"PENDING" | "TAKEN" | "all">("all");
  const [importing, setImporting] = useState(false);
  const { data: actions, mutate: mutateActions } = useActions();
  const { data: decisions, mutate: mutateDecisions } = useDecisions();
  const match = (t: string) => !q.trim() || t.toLowerCase().includes(q.trim().toLowerCase());

  const acts = useMemo(
    () =>
      (actions ?? [])
        .filter((a: Action) => (state === "all" ? true : state === "open" ? a.status === "OPEN" : a.status !== "OPEN"))
        .filter((a) => (!streamId || a.streamId === streamId) && (!typeId || a.meetingTypeId === typeId) && (!party || a.party === party) && match(a.title + " " + a.note))
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.localeCompare(b.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, state, streamId, typeId, party, q],
  );
  const decs = useMemo(
    () =>
      (decisions ?? [])
        .filter((d: Decision) => (dstate === "all" || d.status === dstate) && (!streamId || d.streamId === streamId) && (!typeId || d.meetingTypeId === typeId) && match(d.title + " " + d.detail))
        .sort((a, b) => (a.status === b.status ? (b.decidedOn ?? "").localeCompare(a.decidedOn ?? "") : a.status === "PENDING" ? -1 : 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decisions, dstate, streamId, typeId, q],
  );
  const openCount = (actions ?? []).filter((a) => a.status === "OPEN").length;
  const pendingCount = (decisions ?? []).filter((d) => d.status === "PENDING").length;
  const streams = acc.data.streams.map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }));
  const types = acc.data.meetingTypes.map((t) => ({ id: t.id, label: t.name, emoji: t.emoji }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">✅ Actions & décisions</h1>
          <p className="text-sm text-muted">Le relevé des actions et le registre des décisions de toutes les séances.</p>
        </div>
        {acc.canEdit && (
          <button className="btn btn-sm" onClick={() => setImporting(true)}>
            📝 Importer un CR d'atelier
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line-soft p-0.5" role="tablist">
          {(
            [
              ["actions", `Actions (${openCount} ouvertes)`],
              ["decisions", `Décisions (${pendingCount} attendues)`],
            ] as const
          ).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} className={`rounded-md px-3 py-1 text-sm font-semibold transition ${tab === v ? "bg-petrol text-white" : "text-ink-2 hover:bg-surface-2"}`} onClick={() => setTab(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-line-soft p-3 sm:grid-cols-2 lg:grid-cols-5">
        <input className="input" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
        {tab === "actions" ? (
          <select className="input" value={state} onChange={(e) => setState(e.target.value as typeof state)} aria-label="Statut des actions">
            <option value="open">Ouvertes</option>
            <option value="closed">Faites ou abandonnées</option>
            <option value="all">Toutes</option>
          </select>
        ) : (
          <select className="input" value={dstate} onChange={(e) => setDstate(e.target.value as typeof dstate)} aria-label="Statut des décisions">
            <option value="all">Toutes</option>
            <option value="PENDING">Attendues</option>
            <option value="TAKEN">Prises</option>
          </select>
        )}
        {tab === "actions" && <OptionSelect options={partyOptions(acc)} value={party} onChange={setParty} placeholder="Tous les porteurs" />}
        <OptionSelect options={streams} value={streamId} onChange={setStreamId} placeholder="Tous les streams" />
        <OptionSelect options={types} value={typeId} onChange={setTypeId} placeholder="Toutes les séances" />
      </div>

      {tab === "actions" ? (
        !actions ? (
          <Spinner />
        ) : (
          <ActionsList actions={acts} defaults={{ meetingTypeId: typeId, streamId }} onChanged={() => mutateActions()} showSeries emptyText="Aucune action avec ces filtres." />
        )
      ) : !decisions ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <DecisionsList decisions={decs} defaults={{ meetingTypeId: typeId, streamId, decidedOn: new Date().toISOString().slice(0, 10) }} status={dstate === "PENDING" ? "PENDING" : "TAKEN"} onChanged={() => mutateDecisions()} showSeries emptyText="Aucune décision avec ces filtres." />
        </div>
      )}
      <WorkshopImport open={importing} onClose={() => setImporting(false)} onDone={() => (mutateActions(), mutateDecisions())} />
    </div>
  );
}
