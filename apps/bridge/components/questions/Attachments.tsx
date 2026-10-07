"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { fileSize, openFile, uploadFile, type Uploaded } from "@/lib/upload";
import type { FileInfo } from "@/lib/types";
import { useCl, useQuestionActions } from "../ClientContext";
import { useConfirm } from "../ui";
import { IconClip, IconX } from "../icons";

/** Pièces jointes : liste cliquable (aperçu ou téléchargement), dépôt par bouton ou glisser-déposer. */

function kind(name: string, mime: string) {
  if (/^image\//.test(mime)) return "🖼️";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "📄";
  if (/\.(xlsx?|xlsm|csv|ods)$/i.test(name)) return "📊";
  if (/\.(docx?|odt|rtf)$/i.test(name)) return "📝";
  if (/\.(pptx?|odp)$/i.test(name)) return "📽️";
  if (/\.(zip|7z|rar|gz|tar)$/i.test(name)) return "🗜️";
  return "📎";
}

export function FileChip({ f, onRemove }: { f: { id: string; name: string; mime: string; size: number }; onRemove?: () => void }) {
  const cl = useCl();
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line-soft bg-surface px-2 py-1 text-xs">
      <button type="button" className="flex min-w-0 items-center gap-1.5 text-left text-ink-2 hover:text-accent" onClick={(e) => (e.stopPropagation(), openFile(cl.data.client.slug, f.id, f.mime))} title={`Ouvrir ${f.name}`}>
        <span aria-hidden>{kind(f.name, f.mime)}</span>
        <span className="truncate font-medium">{f.name}</span>
        <span className="shrink-0 text-muted">{fileSize(f.size)}</span>
      </button>
      {onRemove && (
        <button type="button" className="shrink-0 rounded text-muted hover:text-red" onClick={(e) => (e.stopPropagation(), onRemove())} aria-label={`Retirer ${f.name}`} title="Retirer la pièce jointe">
          <IconX width={13} height={13} />
        </button>
      )}
    </span>
  );
}

/** Bouton de dépôt (plusieurs fichiers) avec avancement. */
export function AttachButton({ onFiles, label = "Joindre un fichier", compact = false }: { onFiles: (files: File[], progress: (name: string, pct: number) => void) => Promise<void>; label?: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const busy = Object.keys(progress).length > 0;
  const run = async (files: File[]) => {
    if (!files.length) return;
    setProgress(Object.fromEntries(files.map((f) => [f.name, 0])));
    try {
      await onFiles(files, (name, pct) => setProgress((p) => ({ ...p, [name]: pct })));
    } finally {
      setProgress({});
      if (input.current) input.current.value = "";
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => run([...(e.target.files ?? [])])} aria-label={label} data-testid="file-input" />
      <button type="button" className={`btn btn-ghost btn-sm ${compact ? "!px-1.5" : ""}`} disabled={busy} onClick={(e) => (e.stopPropagation(), input.current?.click())} title={label}>
        <IconClip width={15} height={15} /> {!compact && label}
      </button>
      {busy &&
        Object.entries(progress).map(([n, pct]) => (
          <span key={n} className="text-xs text-muted">
            {n} : {pct} %
          </span>
        ))}
    </span>
  );
}

/** Pièces jointes déjà rattachées à la question ou à un message, avec ajout direct si les droits le permettent. */
export function AttachedFiles({ questionId, messageId, files, canAdd }: { questionId: string; messageId?: string; files: FileInfo[]; canAdd: boolean }) {
  const cl = useCl();
  const act = useQuestionActions();
  const confirm = useConfirm();
  if (!files.length && !canAdd) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {files.map((f) => (
        <FileChip
          key={f.id}
          f={f}
          onRemove={
            f.perms.delete
              ? () =>
                  confirm.ask("Retirer la pièce jointe", `« ${f.name} » sera retirée de la question (l'historique le garde en mémoire).`, async () => {
                    await api(`${cl.base}/files/${f.id}`, { method: "DELETE" });
                    await act.refresh(questionId);
                  })
              : undefined
          }
        />
      ))}
      {canAdd && (
        <AttachButton
          compact={files.length > 0}
          label="Ajouter une pièce jointe"
          onFiles={async (list, progress) => {
            for (const file of list) await uploadFile(cl.data.client.slug, file, { questionId, messageId }, (p) => progress(file.name, p)).catch(() => null);
            await act.refresh(questionId);
          }}
        />
      )}
      {confirm.node}
    </div>
  );
}

/** Pièces en attente pendant la rédaction (nouvelle question, réponse) : déposées tout de suite, rattachées à l'envoi. */
export function usePendingFiles() {
  const cl = useCl();
  const [files, setFiles] = useState<Uploaded[]>([]);
  const add = async (list: File[], progress: (name: string, pct: number) => void) => {
    for (const file of list) {
      try {
        const up = await uploadFile(cl.data.client.slug, file, {}, (p) => progress(file.name, p));
        setFiles((f) => [...f, up]);
      } catch {
        /* message déjà affiché */
      }
    }
  };
  const remove = async (id: string) => {
    setFiles((f) => f.filter((x) => x.id !== id));
    await api(`${cl.base}/files/${id}`, { method: "DELETE", silent: true }).catch(() => null);
  };
  return { files, add, remove, clear: () => setFiles([]) };
}

export function PendingFiles({ p }: { p: ReturnType<typeof usePendingFiles> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.files.map((f) => (
        <FileChip key={f.id} f={f} onRemove={() => p.remove(f.id)} />
      ))}
      <AttachButton onFiles={p.add} />
    </div>
  );
}
