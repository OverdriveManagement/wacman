"use client";

/**
 * Préparation d'une séance (B6) :
 * - « Quoi de neuf depuis la dernière séance » : livrables terminés, créés, passés en alerte, échéances décalées,
 *   météo des streams, actions et décisions, calculé côté serveur à partir du journal ;
 * - brouillon de faits marquants rédigé par Claude, relu et validé avant ajout à la séance.
 */

import useSWR from "swr";
import { useEffect, useState } from "react";
import { api, fetcher, toast } from "@/lib/api";
import { frDate } from "@/lib/format";
import { partyLabel } from "@/lib/followup";
import type { Card, MeetingChanges, Meeting, ReviewCard } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Disclosure, Modal, OptionSelect, Spinner, useSubmit } from "./ui";

export function useMeetingChanges(meetingId: string | null) {
  const acc = useAcc();
  return useSWR<MeetingChanges>(meetingId ? `${acc.base}/meetings/${meetingId}/changes` : null, fetcher, { revalidateOnFocus: false });
}

function CardLine({ c, extra, onOpen }: { c: ReviewCard; extra?: string; onOpen: (id: string) => void }) {
  const acc = useAcc();
  const s = c.streamId ? acc.str.get(c.streamId) : null;
  const level = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;
  return (
    <li className="flex items-baseline gap-1.5 text-sm">
      <button className="min-w-0 text-left text-ink hover:text-accent hover:underline [overflow-wrap:anywhere]" onClick={() => onOpen(c.id)}>
        <span className="text-muted">#{c.ref}</span> {c.emoji ? `${c.emoji} ` : ""}
        {c.title}
      </button>
      {s && <span className="shrink-0 text-xs font-semibold text-ocre">{s.name}</span>}
      {level && <span className="shrink-0 text-xs">{level.emoji || level.label}</span>}
      {extra && <span className="shrink-0 text-xs text-muted">{extra}</span>}
    </li>
  );
}

function Group({ icon, title, count, children }: { icon: string; title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-extrabold uppercase tracking-wider text-accent">
        {icon} {title} <span className="font-semibold text-muted">({count})</span>
      </h4>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

/** Panneau repliable en tête de séance. */
export function WhatsNewPanel({ meeting, onOpenCard }: { meeting: Meeting; onOpenCard: (c: Card) => void }) {
  const acc = useAcc();
  const { data, error } = useMeetingChanges(meeting.id);
  const open = async (id: string) => {
    try {
      onOpenCard(await api<Card>(`${acc.base}/e/card/${id}`));
    } catch {
      /* carte supprimée ou archivée : message déjà affiché */
    }
  };
  if (error) return null;
  if (!data) return <div className="h-10 animate-pulse rounded-xl bg-surface-2" />;
  const c = data.cards;
  const n =
    c.created.length + c.done.length + c.moved.length + c.alertUp.length + c.alertDown.length + c.due.length + data.streams.length + data.actions.created.length + data.actions.closed.length + data.decisions.length + data.sprintSwitches.length;
  const sname = (id: string | null) => (id ? acc.str.get(id)?.name ?? "" : "Transverse");
  const title = (
    <span className="text-sm">
      🆕 Quoi de neuf depuis le {frDate(data.since)}{" "}
      <span className="font-normal text-muted">
        ({n ? `${n} changement${n > 1 ? "s" : ""}` : "rien de notable"}
        {c.updated ? `, ${c.updated} carte${c.updated > 1 ? "s" : ""} mise${c.updated > 1 ? "s" : ""} à jour` : ""})
      </span>
    </span>
  );
  return (
    <div className="rounded-xl border border-line-soft bg-surface-2/40 px-3 py-1" data-testid="whats-new">
      <Disclosure title={title}>
        {!n ? (
          <p className="pb-2 text-sm text-muted">Aucun livrable terminé, créé ou passé en alerte, et aucune action ou décision depuis la séance précédente.</p>
        ) : (
          <div className="grid gap-4 pb-2 md:grid-cols-2">
            <Group icon="🔁" title="Bascule de sprint" count={data.sprintSwitches.length}>
              {data.sprintSwitches.map((s) => (
                <li key={s.at} className="text-sm text-ink-2">
                  {s.summary} ({frDate(s.at.slice(0, 10))})
                </li>
              ))}
            </Group>
            <Group icon="✅" title="Livrables terminés" count={c.done.length}>
              {c.done.map((x) => (
                <CardLine key={x.id} c={x} onOpen={open} />
              ))}
            </Group>
            <Group icon="🆕" title="Nouveaux livrables" count={c.created.length}>
              {c.created.map((x) => (
                <CardLine key={x.id} c={x} onOpen={open} />
              ))}
            </Group>
            <Group icon="🚨" title="Passés en vigilance ou en alerte" count={c.alertUp.length}>
              {c.alertUp.map((x) => (
                <CardLine key={x.id} c={x} onOpen={open} />
              ))}
            </Group>
            <Group icon="🟢" title="Sortis d'alerte" count={c.alertDown.length}>
              {c.alertDown.map((x) => (
                <CardLine key={x.id} c={x} onOpen={open} />
              ))}
            </Group>
            <Group icon="➡️" title="Changement de statut" count={c.moved.length}>
              {c.moved.map((x) => {
                const st = x.statusId ? acc.opt.get(x.statusId) : null;
                return <CardLine key={x.id} c={x} extra={st ? `maintenant ${st.label}` : ""} onOpen={open} />;
              })}
            </Group>
            <Group icon="📅" title="Échéances modifiées" count={c.due.length}>
              {c.due.map((d) => (
                <CardLine key={d.card.id} c={d.card} extra={`${d.from ? frDate(d.from, false) : "sans date"} puis ${d.to ? frDate(d.to, false) : "sans date"}`} onOpen={open} />
              ))}
            </Group>
            <Group icon="🌦️" title="Météo des streams" count={data.streams.length}>
              {data.streams.map((s) => {
                const lbl = (ids: string[]) => ids.map((id) => acc.opt.get(id)?.label).filter(Boolean).join(", ") || "non renseigné";
                return (
                  <li key={s.streamId} className="text-sm text-ink-2">
                    <b className="text-ink">{sname(s.streamId)}</b> :{" "}
                    {s.isNew ? `nouveau statut (${lbl(s.after)})` : s.statusChanged ? `${lbl(s.before)} puis ${lbl(s.after)}` : "texte du statut mis à jour"}
                  </li>
                );
              })}
            </Group>
            <Group icon="☑️" title="Actions closes" count={data.actions.closed.length}>
              {data.actions.closed.map((a) => (
                <li key={a.id} className="text-sm text-ink-2">
                  {a.title} <span className="text-xs text-muted">({partyLabel(a.party, acc)}{a.status === "CANCELLED" ? ", abandonnée" : ""})</span>
                </li>
              ))}
            </Group>
            <Group icon="📌" title="Nouvelles actions" count={data.actions.created.length}>
              {data.actions.created.map((a) => (
                <li key={a.id} className="text-sm text-ink-2">
                  {a.title} <span className="text-xs text-muted">({partyLabel(a.party, acc)})</span>
                </li>
              ))}
            </Group>
            <Group icon="⚖️" title="Décisions" count={data.decisions.length}>
              {data.decisions.map((d) => (
                <li key={d.id} className="text-sm text-ink-2">
                  <span className={d.status === "TAKEN" ? "text-teal" : "text-ocre"}>{d.status === "TAKEN" ? "Prise" : "Attendue"}</span> : {d.title}
                </li>
              ))}
            </Group>
          </div>
        )}
        {c.deleted.length > 0 && <p className="pb-2 text-xs text-muted">{c.deleted.length} carte(s) supprimée(s) sur la période.</p>}
      </Disclosure>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brouillon de faits marquants
// ---------------------------------------------------------------------------

type Draft = { key: string; keep: boolean; title: string; detail: string; streamId: string | null; typeId: string | null };

export function SuggestHighlightsModal({ open, meeting, authorId, onClose, onAdded }: { open: boolean; meeting: Meeting; authorId: string | null; onClose: () => void; onAdded: () => void }) {
  const acc = useAcc();
  const [items, setItems] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streams = acc.data.streams.filter((s) => s.active).map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }));
  const types = acc.byKind("HIGHLIGHT_TYPE").map((o) => ({ id: o.id, label: o.label, emoji: o.emoji }));
  const [load, loading] = useSubmit(async () => {
    setError(null);
    try {
      const r = await api<{ highlights: Omit<Draft, "key" | "keep">[] }>(`${acc.base}/meetings/${meeting.id}/suggest-highlights`, { method: "POST", json: {}, silent: true });
      setItems(r.highlights.map((h, i) => ({ ...h, key: `h${i}`, keep: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Proposition impossible.");
    }
  });
  const close = () => (setItems(null), setError(null), onClose());
  const set = (key: string, p: Partial<Draft>) => setItems((l) => (l ?? []).map((x) => (x.key === key ? { ...x, ...p } : x)));
  const kept = (items ?? []).filter((x) => x.keep && x.title.trim());
  const [add, adding] = useSubmit(async () => {
    let order = meeting.highlights.length;
    for (const h of kept) {
      await api(`${acc.base}/e/highlight`, { method: "POST", json: { meetingId: meeting.id, title: h.title.trim(), detail: h.detail.trim(), streamId: h.streamId, typeId: h.typeId, authorId, order: ++order } });
    }
    toast("success", `${kept.length} fait${kept.length > 1 ? "s" : ""} marquant${kept.length > 1 ? "s" : ""} ajouté${kept.length > 1 ? "s" : ""}.`);
    onAdded();
    close();
  });
  // lancement automatique à l'ouverture
  useEffect(() => {
    if (open && !items && !error) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={close}
      title="✨ Faits marquants proposés"
      wide
      footer={
        <>
          <button className="btn" onClick={close}>
            Annuler
          </button>
          {items && (
            <button className="btn btn-primary" disabled={adding || !kept.length} onClick={() => add()}>
              {adding ? "Ajout…" : `Ajouter ${kept.length} fait${kept.length > 1 ? "s" : ""} marquant${kept.length > 1 ? "s" : ""}`}
            </button>
          )}
        </>
      }
    >
      {loading && <Spinner label="Claude rédige un brouillon à partir de ce qui a changé depuis la séance précédente…" />}
      {error && (
        <div className="space-y-2">
          <p className="text-sm text-red">{error}</p>
          <button className="btn btn-sm" onClick={() => load()}>
            Réessayer
          </button>
        </div>
      )}
      {items && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Brouillon rédigé par Claude. Décochez ce qui ne convient pas, corrigez, puis ajoutez à la séance.</p>
          {!items.length && <p className="text-sm text-muted">Aucune proposition.</p>}
          {items.map((h) => (
            <div key={h.key} className={`rounded-xl border border-line-soft p-3 ${h.keep ? "" : "opacity-50"}`} data-proposal="highlight">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-2.5 h-4 w-4" checked={h.keep} onChange={(e) => set(h.key, { keep: e.target.checked })} aria-label="Garder ce fait marquant" />
                <div className="min-w-0 flex-1 space-y-2">
                  <input className="input font-semibold" value={h.title} aria-label="Titre" onChange={(e) => set(h.key, { title: e.target.value })} />
                  <textarea className="input" rows={3} value={h.detail} aria-label="Détail" onChange={(e) => set(h.key, { detail: e.target.value })} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <OptionSelect options={types} value={h.typeId} onChange={(v) => set(h.key, { typeId: v })} placeholder="Sans type" />
                    <OptionSelect options={streams} value={h.streamId} onChange={(v) => set(h.key, { streamId: v })} placeholder="Transverse" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
