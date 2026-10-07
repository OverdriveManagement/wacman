"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/api";
import type { Party } from "@/lib/types";
import { useCl, useQuestionActions } from "../ClientContext";
import { RichTextarea } from "../RichText";
import { Field, Modal, useSubmit } from "../ui";
import { PendingFiles, usePendingFiles } from "./Attachments";
import { Segmented } from "./Thread";
import { partyColor } from "./Tags";

/** Nouvelle question : sujet, texte, streams, organisation qui la pose et organisation qui doit répondre. */
export function NewQuestionModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (ref: number) => void }) {
  const cl = useCl();
  const act = useQuestionActions();
  const pending = usePendingFiles();
  const can = cl.data.me.canCreate;
  const parties = (["PROVIDER", "CLIENT"] as Party[]).filter((p) => can[p].length > 0);
  const side = cl.data.me.side;
  const [party, setParty] = useState<Party>(parties.includes(side) ? side : (parties[0] ?? side));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [streams, setStreams] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<Party>("CLIENT");
  const [due, setDue] = useState("");

  useEffect(() => {
    if (!open) return;
    const p = parties.includes(side) ? side : (parties[0] ?? side);
    setParty(p);
    setAssigned(p === "CLIENT" ? "PROVIDER" : "CLIENT");
    // un seul stream possible : il est choisi d'office
    setStreams(can[p].length === 1 ? [...can[p]] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allowed = useMemo(() => new Set(can[party] ?? []), [can, party]);
  const options = cl.data.streams.filter((s) => s.active && allowed.has(s.id));
  const reset = () => {
    setSubject("");
    setBody("");
    setStreams([]);
    setDue("");
    pending.clear();
  };
  const [create, busy] = useSubmit(async () => {
    if (!subject.trim()) return toast("error", "Le sujet est obligatoire.");
    if (!streams.length) return toast("error", "Choisissez au moins un stream.");
    const d = await act.create({
      subject: subject.trim(),
      body,
      streamIds: streams,
      askedByParty: party,
      assignedParty: party === "CLIENT" ? "PROVIDER" : assigned,
      dueDate: due || null,
      fileIds: pending.files.map((f) => f.id),
    });
    toast("success", `Question n°${d.ref} créée et attribuée à ${cl.label(d.assignedParty)}.`);
    reset();
    onClose();
    onCreated(d.ref);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Nouvelle question"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={busy || !subject.trim() || !streams.length} onClick={() => create()}>
            {busy ? "Création…" : `Poser la question à ${cl.label(party === "CLIENT" ? "PROVIDER" : assigned)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {parties.length > 1 && (
          <Segmented
            label="Posée au nom de"
            value={party}
            onChange={(p) => {
              setParty(p);
              setAssigned(p === "CLIENT" ? "PROVIDER" : "CLIENT");
              setStreams((s) => s.filter((x) => can[p].includes(x)));
            }}
            options={parties.map((p) => ({ id: p, label: cl.label(p), color: partyColor(p) }))}
          />
        )}
        <Field label="Sujet">
          <input className="input" autoFocus maxLength={300} placeholder="ex. Liste des ATM" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Sujet" />
        </Field>
        <Field label="Question">
          <RichTextarea rows={4} value={body} onChange={setBody} placeholder="ex. Pouvez-vous nous fournir la liste des ATM sous la forme d'un fichier Excel ?" aria-label="Question" />
        </Field>
        <div>
          <span className="label">Streams (un ou plusieurs)</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Streams">
            {options.map((s) => {
              const on = streams.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStreams(on ? streams.filter((x) => x !== s.id) : [...streams, s.id])}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? "border-accent bg-accent/15 text-ink" : "border-line text-ink-2 hover:border-accent/60"}`}
                >
                  {s.emoji ? `${s.emoji} ` : ""}
                  {s.name}
                </button>
              );
            })}
            {!options.length && <span className="text-sm text-muted">Aucun stream où vous pouvez poser une question.</span>}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {party === "PROVIDER" ? (
            <Segmented label="Attribuée à" value={assigned} onChange={setAssigned} options={(["CLIENT", "PROVIDER"] as Party[]).map((p) => ({ id: p, label: cl.label(p), color: partyColor(p) }))} />
          ) : (
            <p className="text-xs text-muted">
              La question est attribuée à <span className="font-semibold" style={{ color: partyColor("PROVIDER") }}>{cl.label("PROVIDER")}</span>.
            </p>
          )}
          <label className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Échéance souhaitée</span>
            <input type="date" className="input !w-auto !py-1 text-sm" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Échéance souhaitée" />
          </label>
        </div>
        <div>
          <span className="label">Pièces jointes</span>
          <PendingFiles p={pending} />
        </div>
      </div>
    </Modal>
  );
}
