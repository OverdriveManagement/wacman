"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { dateTime, frDate } from "@/lib/format";
import type { BridgeEvent, Party, QStatus, Question } from "@/lib/types";
import { useCl } from "../ClientContext";
import { Markdown } from "../Markdown";
import { Modal } from "../ui";
import { PartyTag, STATUS_LABEL } from "./Tags";

/** Historique de toutes les modifications d'une question, du plus ancien au plus récent. */

const ACTION_LABEL: Record<string, string> = {
  create: "Création",
  update: "Modification",
  answer: "Réponse",
  assign: "Attribution",
  close: "Clôture",
  reopen: "Réouverture",
  message_edit: "Message modifié",
  attach: "Pièce jointe",
  detach: "Pièce jointe",
  delete: "Suppression",
  restore: "Restauration",
};

const FIELD: Record<string, string> = {
  subject: "Sujet",
  body: "Texte de la question",
  dueDate: "Échéance",
  streams: "Streams",
  assignedParty: "Attribution",
  status: "Statut",
  message: "Message",
  files: "Pièces jointes",
  file: "Fichier",
};

function TextBlock({ title, text }: { title: string; text: unknown }) {
  const t = typeof text === "string" ? text : "";
  return (
    <div className="rounded-lg border border-line-soft bg-surface-2/60 px-2.5 py-1.5">
      <div className="mb-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">{title}</div>
      {t.trim() ? <Markdown text={t} className="text-xs text-ink-2" /> : <span className="text-xs text-muted">vide</span>}
    </div>
  );
}

function Change({ k, v }: { k: string; v: unknown }) {
  const cl = useCl();
  const show = (x: unknown): string => {
    if (k === "assignedParty") return cl.label(x as Party) || "aucune (clôturée)";
    if (x === null || x === undefined || x === "") return "vide";
    if (Array.isArray(x)) return x.length ? x.join(", ") : "aucun";
    if (k === "status") return STATUS_LABEL[x as QStatus] ?? String(x);
    if (k === "dueDate") return frDate(String(x));
    return String(x);
  };
  const label = FIELD[k] ?? k;
  // texte long : avant et après côte à côte
  if ((k === "body" || k === "message") && Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[1] === "string")) {
    return (
      <div className="mt-1 grid gap-1.5 md:grid-cols-2">
        <TextBlock title={`${label}, avant`} text={v[0]} />
        <TextBlock title={`${label}, après`} text={v[1]} />
      </div>
    );
  }
  if ((k === "body" || k === "message") && typeof v === "string") return <div className="mt-1">{v.trim() ? <TextBlock title={label} text={v} /> : null}</div>;
  if (Array.isArray(v) && v.length === 2 && k !== "files" && k !== "streams") {
    return (
      <div className="mt-0.5 text-xs text-muted">
        <span className="font-medium text-ink-2">{label}</span> : {show(v[0])} <span className="text-accent">devient</span> {show(v[1])}
      </div>
    );
  }
  if (k === "streams" && Array.isArray(v) && v.length === 2 && Array.isArray(v[0])) {
    return (
      <div className="mt-0.5 text-xs text-muted">
        <span className="font-medium text-ink-2">{label}</span> : {show(v[0])} <span className="text-accent">devient</span> {show(v[1])}
      </div>
    );
  }
  return (
    <div className="mt-0.5 text-xs text-muted">
      <span className="font-medium text-ink-2">{label}</span> : {show(v)}
    </div>
  );
}

export function HistoryModal({ q, onClose }: { q: Question | null; onClose: () => void }) {
  const cl = useCl();
  const { data } = useSWR<BridgeEvent[]>(q ? `${cl.base}/questions/${q.id}/history` : null, fetcher);
  return (
    <Modal open={!!q} onClose={onClose} wide title={q ? `Historique de la question n°${q.ref}` : ""}>
      {!data ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : !data.length ? (
        <p className="text-sm text-muted">Aucune modification enregistrée.</p>
      ) : (
        <ol className="space-y-3">
          {data.map((e) => (
            <li key={e.id} className="border-l-2 border-line pl-3" data-event={e.action}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.65rem] font-semibold text-ink-2">{ACTION_LABEL[e.action] ?? e.action}</span>
                <span className="font-semibold text-ink-2">{e.userName}</span>
                {e.party && <PartyTag party={e.party} />}
                <span>{dateTime(e.createdAt)}</span>
              </div>
              <div className="mt-0.5 text-sm text-ink-2">{e.summary}</div>
              {Object.entries(e.changes ?? {})
                .filter(([k, v]) => !(e.action === "create" && (k === "subject" || (k === "assignedParty" && typeof v === "string"))))
                .filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length))
                // attribution conservée : rien à montrer de plus que le résumé
                .filter(([, v]) => !(Array.isArray(v) && v.length === 2 && !Array.isArray(v[0]) && v[0] === v[1]))
                .map(([k, v]) => (
                  <Change key={k} k={k} v={v} />
                ))}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
