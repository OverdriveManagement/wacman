"use client";

import useSWR from "swr";
import { useState } from "react";
import { api, fetcher } from "@/lib/api";
import { relative, dateTime } from "@/lib/format";
import type { AuditEntry, Comment } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { useMe } from "@/lib/hooks";
import { Markdown } from "./Markdown";
import { IconTrash } from "./icons";

export function Comments({ entityType, entityId, onCount }: { entityType: string; entityId: string; onCount?: (n: number) => void }) {
  const acc = useAcc();
  const { data: me } = useMe();
  const key = `${acc.base}/comments/${entityType}/${entityId}`;
  const { data, mutate } = useSWR<Comment[]>(key, fetcher);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(key, { method: "POST", json: { body } });
      setBody("");
      const list = await mutate();
      onCount?.(list?.length ?? 0);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      {(data ?? []).length === 0 && <p className="text-sm text-muted">Aucun commentaire.</p>}
      {(data ?? []).map((c) => (
        <div key={c.id} className="rounded-xl border border-line-soft bg-surface-2/60 px-3 py-2">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted">
            <span className="font-semibold text-ink-2">{c.authorName ?? "Utilisateur supprimé"}</span>
            <span title={dateTime(c.createdAt)}>{relative(c.createdAt)}</span>
            {(c.authorId === me?.user.id || acc.isAdmin) && (
              <button
                className="ml-auto text-muted hover:text-red"
                aria-label="Supprimer le commentaire"
                onClick={async () => {
                  await api(`${acc.base}/comments/${c.id}`, { method: "DELETE" });
                  const list = await mutate();
                  onCount?.(list?.length ?? 0);
                }}
              >
                <IconTrash width={14} height={14} />
              </button>
            )}
          </div>
          <Markdown text={c.body} className="text-sm text-ink-2" />
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <textarea
          className="input"
          rows={2}
          placeholder="Ajouter un commentaire… (Ctrl+Entrée pour envoyer)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          }}
        />
        <div className="flex justify-end">
          <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()} onClick={send}>
            Commenter
          </button>
        </div>
      </div>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  title: "Titre",
  emoji: "Picto",
  description: "Description",
  progressNote: "Point d'avancement",
  nextSteps: "Prochaines étapes",
  alertsNote: "Alertes / arbitrages",
  dueDate: "Échéance",
  progressPct: "Avancement %",
  streamId: "Stream",
  sprintId: "Sprint",
  statusId: "Statut",
  alertLevelId: "Vigilance / Alerte",
  ownerId: "Porteur",
  archived: "Archivée",
  detail: "Détail",
  decisionRequest: "Arbitrage ou décision",
  themeId: "Thématique",
  natureId: "Nature",
  typeId: "Type",
  statusIds: "Statuts",
  progress: "Avancement",
  alerts: "Alertes",
  mitigation: "Décision / mitigation",
  criticalityId: "Criticité",
  order: "Ordre",
  cardIds: "Cartes liées",
};

export function History({ entityType, entityId }: { entityType: string; entityId: string }) {
  const acc = useAcc();
  const { data } = useSWR<AuditEntry[]>(`${acc.base}/audit?entityType=${entityType}&entityId=${entityId}`, fetcher);
  const resolve = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "vide";
    const s = String(v);
    if (/Id$/.test(k)) {
      return acc.opt.get(s)?.label ?? acc.str.get(s)?.name ?? acc.spr.get(s)?.name ?? acc.ctc.get(s)?.name ?? s.slice(0, 8);
    }
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  };
  if (!data) return <p className="text-sm text-muted">Chargement…</p>;
  if (!data.length) return <p className="text-sm text-muted">Aucune modification enregistrée.</p>;
  return (
    <ol className="space-y-3">
      {data.map((e) => (
        <li key={e.id} className="border-l-2 border-line pl-3">
          <div className="text-xs text-muted">
            <span className="font-semibold text-ink-2">{e.userName}</span>
            {e.viaAssistant && <span className="ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[0.65rem] text-accent">via l'assistant</span>}, {dateTime(e.createdAt)}
          </div>
          <div className="text-sm text-ink-2">{e.summary}</div>
          {e.action !== "comment" &&
            Object.entries(e.changes ?? {})
              .filter(([, v]) => Array.isArray(v))
              .map(([k, v]) => (
                <div key={k} className="mt-0.5 text-xs text-muted">
                  <span className="font-medium text-ink-2">{FIELD_LABELS[k] ?? k}</span> : {resolve(k, (v as unknown[])[0])} <span className="text-accent">devient</span> {resolve(k, (v as unknown[])[1])}
                </div>
              ))}
        </li>
      ))}
    </ol>
  );
}
