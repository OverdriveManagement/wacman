"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { api, toast } from "@/lib/api";
import type { Party } from "@/lib/types";
import { useCl } from "../ClientContext";
import { Modal, Spinner, useSubmit } from "../ui";

/**
 * Réimport de la fiche navette : le fichier est analysé par l'API (aperçu ligne par ligne : action prévue ou raison
 * du refus), puis les lignes retenues sont appliquées avec les droits de la personne connectée.
 */

type Target = Party | "CLOSE" | null;
interface PlanItem {
  line: number;
  questionId: string | null;
  ref: number | null;
  subject: string;
  body: string;
  target: Target;
  version: string | null;
  action: "answer" | "assign" | "close" | "reopen" | null;
  summary: string;
  warning: string | null;
  error: string | null;
}
interface Preview {
  rows: number;
  empty: number;
  ready: number;
  items: PlanItem[];
}
interface ApplyResult {
  done: number;
  failed: number;
  results: { line: number; ref: number | null; subject: string; summary: string; ok: boolean; error: string | null }[];
}

export function NavetteImport({ file, onClose }: { file: File | null; onClose: () => void }) {
  const cl = useCl();
  const { mutate } = useSWRConfig();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    setResult(null);
    if (!file) return;
    let live = true;
    (async () => {
      try {
        if (!/\.xlsx$/i.test(file.name)) throw new Error("Choisissez la fiche navette au format Excel (.xlsx).");
        const r = await api<Preview>(`${cl.base}/navette/preview`, { method: "POST", body: await file.arrayBuffer(), headers: { "Content-Type": "application/octet-stream" }, silent: true });
        if (live) setPreview(r);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [file, cl.base]);

  const ready = preview?.items.filter((i) => !i.error && i.questionId) ?? [];
  const [apply, applying] = useSubmit(async () => {
    const r = await api<ApplyResult>(`${cl.base}/navette/apply`, {
      method: "POST",
      json: { items: ready.map((i) => ({ line: i.line, questionId: i.questionId, body: i.body, target: i.target, version: i.version })) },
    });
    setResult(r);
    await mutate((key) => typeof key === "string" && key.startsWith(`${cl.base}/questions`));
    toast(r.failed ? "error" : "success", r.failed ? `${r.done} ligne(s) importée(s), ${r.failed} refusée(s).` : `${r.done} ligne${r.done > 1 ? "s" : ""} importée${r.done > 1 ? "s" : ""}.`);
  });

  const footer = result ? (
    <button className="btn btn-primary" onClick={onClose}>
      Fermer
    </button>
  ) : (
    <>
      <button className="btn" onClick={onClose}>
        Annuler
      </button>
      <button className="btn btn-primary" disabled={!ready.length || applying} onClick={apply}>
        {applying ? "Import…" : ready.length ? `Importer ${ready.length} ligne${ready.length > 1 ? "s" : ""}` : "Rien à importer"}
      </button>
    </>
  );

  return (
    <Modal open={!!file} onClose={onClose} wide title="Importer la fiche navette" footer={footer}>
      {error ? (
        <p className="rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">{error}</p>
      ) : !preview ? (
        <Spinner label="Lecture du fichier…" />
      ) : result ? (
        <div className="space-y-3" data-navette-result>
          <p className="text-sm text-ink-2">
            {result.done} ligne{result.done > 1 ? "s" : ""} importée{result.done > 1 ? "s" : ""}
            {result.failed ? `, ${result.failed} refusée${result.failed > 1 ? "s" : ""}` : ""}. Les réponses figurent dans les échanges avec la mention « fiche navette ».
          </p>
          <Lines items={result.results.map((r) => ({ key: r.line, ref: r.ref, subject: r.subject, text: r.ok ? r.summary : r.error ?? "", ok: r.ok, warning: null }))} />
        </div>
      ) : (
        <div className="space-y-3" data-navette-preview>
          <p className="text-sm text-ink-2">
            {file?.name} : {preview.rows} question{preview.rows > 1 ? "s" : ""} dans le fichier, {preview.items.length} ligne{preview.items.length > 1 ? "s" : ""} remplie{preview.items.length > 1 ? "s" : ""}
            {preview.items.length ? `, dont ${preview.ready} à importer` : ""}. Les réponses sont enregistrées à votre nom, avec vos droits, comme depuis l'écran.
          </p>
          {preview.items.length ? (
            <Lines items={preview.items.map((i) => ({ key: i.line, ref: i.ref, subject: i.subject, text: i.error ?? i.summary, ok: !i.error, warning: i.warning, body: i.body }))} />
          ) : (
            <p className="text-sm text-muted">Aucune réponse ni nouvel attribué dans le fichier : remplissez les colonnes jaunes puis importez-le de nouveau.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

function Lines({ items }: { items: { key: number; ref: number | null; subject: string; text: string; ok: boolean; warning: string | null; body?: string }[] }) {
  return (
    <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
      {items.map((i) => (
        <li key={i.key} className="flex gap-3 px-3 py-2" data-navette-line={i.key} data-ok={i.ok ? "1" : "0"}>
          <span className={`mt-0.5 shrink-0 text-sm font-bold ${i.ok ? "text-teal" : "text-red"}`} aria-hidden>
            {i.ok ? "✓" : "✕"}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold text-ink">
              {i.ref ? `n°${i.ref} ` : ""}
              {i.subject || `Ligne ${i.key}`}
            </div>
            <div className={i.ok ? "text-ink-2" : "text-red"}>{i.text}</div>
            {i.body && i.ok && <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-muted">{i.body}</div>}
            {i.warning && <div className="mt-0.5 text-xs text-amber">{i.warning}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}
