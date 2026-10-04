"use client";

/**
 * Import d'un compte rendu d'atelier (D15) : texte collé ou fichier (.docx, .txt, .md, .vtt, .srt).
 * Claude propose des actions, des livrables (cartes) et des décisions ; l'utilisateur relit,
 * corrige et valide chaque proposition une par une (ou toutes celles qui restent). Rien n'est créé sans validation.
 */

import { useRef, useState } from "react";
import { api, toast } from "@/lib/api";
import { frDate, todayIso } from "@/lib/format";
import { partyOptions } from "@/lib/followup";
import type { ActionParty } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Field, Modal, OptionSelect, Spinner, useSubmit } from "./ui";

type State = "todo" | "done" | "skip";
interface PAction {
  kind: "action";
  key: string;
  state: State;
  title: string;
  party: ActionParty;
  ownerId: string | null;
  ownerName: string;
  streamId: string | null;
  dueDate: string | null;
  source: string;
}
interface PCard {
  kind: "card";
  key: string;
  state: State;
  title: string;
  description: string;
  streamId: string | null;
  ownerId: string | null;
  dueDate: string | null;
  source: string;
}
interface PDecision {
  kind: "decision";
  key: string;
  state: State;
  title: string;
  detail: string;
  status: "TAKEN" | "PENDING";
  streamId: string | null;
  source: string;
}
type Proposal = PAction | PCard | PDecision;
type Extract = {
  chars: number;
  actions: Omit<PAction, "kind" | "key" | "state">[];
  cards: Omit<PCard, "kind" | "key" | "state">[];
  decisions: Omit<PDecision, "kind" | "key" | "state">[];
};

const ACCEPT = ".docx,.txt,.md,.vtt,.srt";
const MAX_FILE = 15 * 1024 * 1024;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("Lecture du fichier impossible."));
    r.readAsDataURL(file);
  });
}

export function WorkshopImport({
  open,
  onClose,
  onDone,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  defaults?: { streamId?: string | null; meetingTypeId?: string | null; meetingId?: string | null; date?: string | null };
}) {
  const acc = useAcc();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaults?.date ?? todayIso());
  const [streamId, setStreamId] = useState<string | null>(defaults?.streamId ?? null);
  const [typeId, setTypeId] = useState<string | null>(defaults?.meetingTypeId ?? null);
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [chars, setChars] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const statuses = acc.byKind("CARD_STATUS");
  const firstOpen = statuses.find((s) => !s.meta?.done) ?? statuses[0];
  const [sprintId, setSprintId] = useState<string | null>(acc.currentSprint?.id ?? null);
  const [statusId, setStatusId] = useState<string | null>(firstOpen?.id ?? null);

  const streams = acc.data.streams.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }));
  const contacts = acc.data.contacts.map((c) => ({ id: c.id, label: c.name }));
  const types = acc.data.meetingTypes.filter((t) => t.active !== false).map((t) => ({ id: t.id, label: t.name, emoji: t.emoji }));
  const sprints = acc.data.sprints.filter((s) => s.state !== "DONE").map((s) => ({ id: s.id, label: s.name }));
  const parties = partyOptions(acc);

  const reset = () => {
    setItems(null);
    setText("");
    setFile(null);
    setTitle("");
    setChars(0);
    if (fileRef.current) fileRef.current.value = "";
  };
  const close = () => {
    if (items?.some((i) => i.state === "done")) onDone();
    reset();
    onClose();
  };

  const [analyse, analysing] = useSubmit(async () => {
    if (!file && text.trim().length < 40) return toast("error", "Collez le compte rendu ou déposez un fichier.");
    if (file && file.size > MAX_FILE) return toast("error", "Fichier trop lourd (15 Mo au plus).");
    const body: Record<string, unknown> = { streamId, meetingTypeId: typeId, date, title: title.trim() || undefined };
    if (file) body.file = { name: file.name, base64: await readBase64(file) };
    else body.text = text;
    const r = await api<Extract>(`${acc.base}/ai/extract`, { method: "POST", json: body });
    let n = 0;
    const k = () => `p${n++}`;
    const list: Proposal[] = [
      ...r.actions.map((a) => ({ ...a, kind: "action" as const, key: k(), state: "todo" as const })),
      ...r.cards.map((c) => ({ ...c, kind: "card" as const, key: k(), state: "todo" as const })),
      ...r.decisions.map((d) => ({ ...d, kind: "decision" as const, key: k(), state: "todo" as const })),
    ];
    setChars(r.chars);
    setItems(list);
    if (!list.length) toast("error", "Claude n'a rien trouvé à tracer dans ce compte rendu.");
  });

  const set = (key: string, patch: Partial<Proposal>) => setItems((l) => (l ?? []).map((i) => (i.key === key ? ({ ...i, ...patch } as Proposal) : i)));
  const origin = title.trim() ? `Atelier « ${title.trim()} »${date ? ` du ${frDate(date)}` : ""}` : date ? `Atelier du ${frDate(date)}` : "";

  const create = async (p: Proposal) => {
    if (!p.title.trim()) throw new Error("L'intitulé est obligatoire.");
    if (p.kind === "action")
      await api(`${acc.base}/e/action`, {
        method: "POST",
        json: { title: p.title.trim(), party: p.party, ownerId: p.ownerId, streamId: p.streamId, dueDate: p.dueDate, meetingTypeId: typeId, meetingId: defaults?.meetingId ?? null, note: origin },
      });
    else if (p.kind === "card")
      await api(`${acc.base}/e/card`, {
        method: "POST",
        json: { title: p.title.trim(), description: p.description, streamId: p.streamId, ownerId: p.ownerId, dueDate: p.dueDate, sprintId, statusId },
      });
    else
      await api(`${acc.base}/e/decision`, {
        method: "POST",
        json: {
          title: p.title.trim(),
          detail: [p.detail, origin].filter(Boolean).join("\n"),
          status: p.status,
          decidedOn: p.status === "TAKEN" ? date || todayIso() : null,
          streamId: p.streamId,
          meetingTypeId: typeId,
          meetingId: defaults?.meetingId ?? null,
        },
      });
    set(p.key, { state: "done" });
  };
  const [createOne] = useSubmit(async (p: Proposal) => {
    try {
      await create(p);
    } catch (e) {
      if (e instanceof Error && !("status" in e)) toast("error", e.message);
    }
  });
  const [createAll, creatingAll] = useSubmit(async () => {
    const todo = (items ?? []).filter((i) => i.state === "todo");
    let ok = 0;
    for (const p of todo) {
      try {
        await create(p);
        ok++;
      } catch {
        /* l'erreur est déjà affichée ; on continue avec les suivantes */
      }
    }
    if (ok) toast("success", `${ok} élément${ok > 1 ? "s" : ""} créé${ok > 1 ? "s" : ""}.`);
  });

  const left = (items ?? []).filter((i) => i.state === "todo").length;
  const doneCount = (items ?? []).filter((i) => i.state === "done").length;

  const footer = !items ? (
    <>
      <button className="btn" onClick={close}>
        Annuler
      </button>
      <button className="btn btn-primary" disabled={analysing || (!file && text.trim().length < 40)} onClick={() => analyse()}>
        {analysing ? "Analyse en cours…" : "Analyser avec Claude"}
      </button>
    </>
  ) : (
    <>
      <button className="btn mr-auto" onClick={() => setItems(null)} disabled={creatingAll}>
        Revenir au texte
      </button>
      <button className="btn" onClick={close}>
        {left ? "Fermer" : "Terminer"}
      </button>
      {left > 0 && (
        <button className="btn btn-primary" disabled={creatingAll} onClick={() => createAll()}>
          {creatingAll ? "Création…" : `Créer les ${left} restantes`}
        </button>
      )}
    </>
  );

  const section = (kind: Proposal["kind"], label: string, hint: string) => {
    const list = (items ?? []).filter((i) => i.kind === kind);
    if (!list.length) return null;
    return (
      <section className="space-y-2">
        <h3 className="flex items-baseline gap-2 text-xs font-extrabold uppercase tracking-wider text-accent">
          {label} <span className="font-semibold normal-case tracking-normal text-muted">{hint}</span>
        </h3>
        {list.map((p) => (
          <div key={p.key} className={`rounded-xl border p-3 transition ${p.state === "done" ? "border-teal/40 bg-teal/5" : p.state === "skip" ? "border-line-soft opacity-50" : "border-line-soft"}`} data-proposal={p.kind}>
            <div className="flex items-start gap-2">
              <input
                className="input flex-1 font-semibold"
                value={p.title}
                disabled={p.state !== "todo"}
                aria-label="Intitulé"
                onChange={(e) => set(p.key, { title: e.target.value })}
              />
              {p.state === "todo" ? (
                <div className="flex shrink-0 gap-1">
                  <button className="btn btn-primary btn-sm" onClick={() => createOne(p)} aria-label={`Créer : ${p.title}`}>
                    ✓ Créer
                  </button>
                  <button className="btn btn-sm" onClick={() => set(p.key, { state: "skip" })}>
                    Ignorer
                  </button>
                </div>
              ) : p.state === "done" ? (
                <span className="mt-1.5 shrink-0 text-xs font-semibold text-teal">✓ Créée</span>
              ) : (
                <button className="btn btn-ghost btn-sm shrink-0" onClick={() => set(p.key, { state: "todo" })}>
                  Reprendre
                </button>
              )}
            </div>
            {p.state === "todo" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {p.kind === "action" && (
                  <select className="input" value={p.party} aria-label="Porteur" onChange={(e) => set(p.key, { party: e.target.value as ActionParty })}>
                    {parties.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {p.kind === "decision" && (
                  <select className="input" value={p.status} aria-label="Statut de la décision" onChange={(e) => set(p.key, { status: e.target.value as "TAKEN" | "PENDING" })}>
                    <option value="TAKEN">Décision prise</option>
                    <option value="PENDING">Décision attendue</option>
                  </select>
                )}
                <OptionSelect options={streams} value={p.streamId} onChange={(v) => set(p.key, { streamId: v })} placeholder="Sans stream" />
                {p.kind !== "decision" && (
                  <OptionSelect options={contacts} value={p.ownerId} onChange={(v) => set(p.key, { ownerId: v })} placeholder={p.kind === "action" && p.ownerName && !p.ownerId ? `Porteur : ${p.ownerName} (inconnu)` : "Sans porteur nominatif"} />
                )}
                {p.kind !== "decision" && <input type="date" className="input" value={p.dueDate ?? ""} aria-label="Échéance" onChange={(e) => set(p.key, { dueDate: e.target.value || null })} />}
                {p.kind === "card" && (
                  <textarea className="input sm:col-span-2 lg:col-span-4" rows={2} value={p.description} placeholder="Description" aria-label="Description" onChange={(e) => set(p.key, { description: e.target.value })} />
                )}
                {p.kind === "decision" && (
                  <textarea className="input sm:col-span-2 lg:col-span-3" rows={2} value={p.detail} placeholder="Précisions" aria-label="Précisions" onChange={(e) => set(p.key, { detail: e.target.value })} />
                )}
              </div>
            )}
            {p.source && p.state === "todo" && <p className="mt-1.5 text-[0.72rem] italic text-muted [overflow-wrap:anywhere]">« {p.source} »</p>}
          </div>
        ))}
      </section>
    );
  };

  return (
    <Modal open={open} onClose={close} title="📝 Importer un compte rendu d'atelier" wide footer={footer}>
      {!items ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Collez le compte rendu ou la transcription, ou déposez le fichier. Claude propose les actions, les livrables et les décisions à tracer ; vous validez chaque proposition avant création.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Atelier">
              <input className="input" value={title} placeholder="Ex. Atelier IPAM" onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Date de l'atelier">
              <input type="date" className="input" value={date ?? ""} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Stream principal">
              <OptionSelect options={streams} value={streamId} onChange={setStreamId} placeholder="Plusieurs streams" />
            </Field>
            <Field label="Rattacher les actions à" hint="Les actions apparaîtront dans le relevé de cette série de séances.">
              <OptionSelect options={types} value={typeId} onChange={setTypeId} placeholder="Aucune série de séances" />
            </Field>
          </div>
          <Field label="Fichier" hint="Word (.docx), texte (.txt, .md) ou sous-titres de visio (.vtt, .srt).">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          {file ? (
            <p className="text-xs text-muted">
              Fichier retenu : {file.name}.{" "}
              <button className="font-semibold text-accent underline" onClick={() => (setFile(null), fileRef.current && (fileRef.current.value = ""))}>
                Retirer
              </button>
            </p>
          ) : (
            <Field label="Ou texte du compte rendu">
              <textarea className="input min-h-48" value={text} placeholder="Collez ici le compte rendu ou la transcription de l'atelier" onChange={(e) => setText(e.target.value)} />
            </Field>
          )}
          {analysing && <Spinner label="Claude lit le compte rendu, cela peut prendre jusqu'à une minute…" />}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-muted">
            {chars.toLocaleString("fr-FR")} caractères analysés. {items.length} proposition{items.length > 1 ? "s" : ""}, {doneCount} créée{doneCount > 1 ? "s" : ""}. Relisez, corrigez puis créez chaque élément.
          </p>
          {section("action", "Actions", "relevé des actions")}
          {items.some((i) => i.kind === "card") && (
            <div className="space-y-2">
              {section("card", "Livrables", "nouvelles cartes du kanban")}
              <div className="grid gap-2 rounded-lg bg-surface-2 p-2 sm:grid-cols-2">
                <Field label="Sprint des nouvelles cartes">
                  <OptionSelect options={sprints} value={sprintId} onChange={setSprintId} placeholder="Sans sprint" />
                </Field>
                <Field label="Statut des nouvelles cartes">
                  <OptionSelect options={statuses.map((s) => ({ id: s.id, label: s.label, emoji: s.emoji }))} value={statusId} onChange={setStatusId} placeholder="Sans statut" />
                </Field>
              </div>
            </div>
          )}
          {section("decision", "Décisions", "registre des décisions")}
        </div>
      )}
    </Modal>
  );
}
