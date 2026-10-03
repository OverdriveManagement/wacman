"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { api, fetcher, toast } from "@/lib/api";
import { frDate, tone } from "@/lib/format";
import type { Card, Risk } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { Markdown } from "@/components/Markdown";
import { Comments, History } from "@/components/Comments";
import { Empty, Field, Modal, OptionSelect, Pill, SectionTitle, Spinner, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";

export default function RisksPage() {
  const acc = useAcc();
  const { data: risks, mutate } = useSWR<Risk[]>(`${acc.base}/e/risk`, fetcher);
  const { data: cards } = useSWR<Card[]>(`${acc.base}/cards`, fetcher);
  const [edit, setEdit] = useState<Risk | "new" | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [stream, setStream] = useState<string | null>(null);

  const list = useMemo(
    () =>
      (risks ?? [])
        .filter((r) => (!type || r.typeId === type) && (!stream || r.streamId === stream) && (showClosed || !acc.opt.get(r.statusId ?? "")?.meta?.closed))
        .sort((a, b) => (acc.opt.get(a.criticalityId ?? "")?.order ?? 9) - (acc.opt.get(b.criticalityId ?? "")?.order ?? 9) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")),
    [risks, type, stream, showClosed, acc],
  );

  return (
    <div className="space-y-4">
      <SectionTitle
        icon="⚖️"
        actions={
          acc.canEdit && (
            <button className="btn btn-primary btn-sm" onClick={() => setEdit("new")}>
              <IconPlus /> Nouveau risque ou arbitrage
            </button>
          )
        }
      >
        Risques & arbitrages
      </SectionTitle>
      <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:items-center">
        <OptionSelect className="lg:w-48" options={acc.byKind("RISK_TYPE")} value={type} onChange={setType} placeholder="Tous les types" />
        <OptionSelect className="lg:w-60" options={acc.data.streams.map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }))} value={stream} onChange={setStream} placeholder="Tous les streams" />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Afficher les éléments clos
        </label>
      </div>
      {!risks ? (
        <Spinner />
      ) : !list.length ? (
        <Empty>Aucun élément.</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((r) => {
            const crit = r.criticalityId ? acc.opt.get(r.criticalityId) : null;
            const s = r.streamId ? acc.str.get(r.streamId) : null;
            return (
              <button key={r.id} onClick={() => setEdit(r)} className="card p-4 text-left transition hover:border-accent" style={{ borderLeft: `3px solid ${tone[crit?.color ?? "slate"]}` }}>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Pill option={r.typeId ? acc.opt.get(r.typeId) : null} small />
                  <Pill option={crit} small />
                  <Pill option={r.statusId ? acc.opt.get(r.statusId) : null} small />
                  {r.dueDate && <span className="ml-auto text-xs text-muted">échéance {frDate(r.dueDate)}</span>}
                </div>
                <div className="font-semibold text-ink">{r.title}</div>
                <div className="mt-0.5 text-xs text-ocre">{[s ? `${s.emoji} ${s.name}` : "", r.instance].filter(Boolean).join(", ")}</div>
                {r.description && <Markdown text={r.description} className="mt-2 line-clamp-3 text-sm text-ink-2" />}
                {r.mitigation && (
                  <div className="mt-2 border-t border-line-soft pt-2 text-sm text-ink-2">
                    <span className="font-semibold text-teal">Décision / mitigation : </span>
                    {r.mitigation}
                  </div>
                )}
                {!!r.cardIds.length && <div className="mt-2 text-xs text-muted">{r.cardIds.length} carte(s) liée(s)</div>}
              </button>
            );
          })}
        </div>
      )}
      <RiskModal item={edit} cards={cards ?? []} onClose={() => setEdit(null)} reload={() => mutate()} />
    </div>
  );
}

function RiskModal({ item, cards, onClose, reload }: { item: Risk | "new" | null; cards: Card[]; onClose: () => void; reload: () => void }) {
  const acc = useAcc();
  const isNew = item === "new";
  type RForm = {
    title: string;
    typeId: string | null;
    statusId: string | null;
    criticalityId: string | null;
    streamId: string | null;
    description: string;
    mitigation: string;
    instance: string;
    dueDate: string | null;
    ownerId: string | null;
    cardIds: string[];
  };
  const blank: RForm = {
    title: "",
    typeId: acc.byKind("RISK_TYPE")[0]?.id ?? null,
    statusId: acc.byKind("RISK_STATUS")[0]?.id ?? null,
    criticalityId: acc.byKind("RISK_CRITICALITY")[1]?.id ?? null,
    streamId: null,
    description: "",
    mitigation: "",
    instance: "",
    dueDate: null,
    ownerId: null,
    cardIds: [],
  };
  const init = isNew || !item ? blank : item;
  const [form, setForm] = useState<RForm>(init as RForm);
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setForm(init as RForm);
  }
  const confirm = useConfirm();
  const ro = !acc.canEdit;
  const save = async () => {
    if (!form.title.trim()) return toast("error", "Le sujet est obligatoire.");
    const data = { ...form, title: form.title.trim() };
    if (isNew) await api(`${acc.base}/e/risk`, { method: "POST", json: data });
    else if (item) await api(`${acc.base}/e/risk/${item.id}`, { method: "PATCH", json: data });
    reload();
    onClose();
  };
  const set = (p: Partial<RForm>) => setForm({ ...form, ...p });
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      wide
      title={isNew ? "Nouveau risque ou arbitrage" : "Risque ou arbitrage"}
      footer={
        !ro && (
          <>
            {!isNew && item && (
              <button
                className="btn btn-danger mr-auto"
                onClick={() =>
                  confirm.ask("Supprimer", "Cet élément sera supprimé définitivement.", async () => {
                    await api(`${acc.base}/e/risk/${item.id}`, { method: "DELETE" });
                    reload();
                    onClose();
                  })
                }
              >
                <IconTrash /> Supprimer
              </button>
            )}
            <button className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={save}>
              Enregistrer
            </button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <Field label="Sujet">
          <input className="input" disabled={ro} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type">
            <OptionSelect disabled={ro} options={acc.byKind("RISK_TYPE")} value={form.typeId} onChange={(v) => set({ typeId: v })} />
          </Field>
          <Field label="Criticité">
            <OptionSelect disabled={ro} options={acc.byKind("RISK_CRITICALITY")} value={form.criticalityId} onChange={(v) => set({ criticalityId: v })} />
          </Field>
          <Field label="Statut">
            <OptionSelect disabled={ro} options={acc.byKind("RISK_STATUS")} value={form.statusId} onChange={(v) => set({ statusId: v })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Stream">
            <OptionSelect disabled={ro} options={acc.data.streams.map((s) => ({ id: s.id, label: s.name, emoji: s.emoji }))} value={form.streamId} onChange={(v) => set({ streamId: v })} />
          </Field>
          <Field label="Porteur">
            <OptionSelect disabled={ro} options={acc.data.contacts.map((c) => ({ id: c.id, label: c.name }))} value={form.ownerId} onChange={(v) => set({ ownerId: v })} />
          </Field>
          <Field label="Échéance">
            <input className="input" type="date" disabled={ro} value={form.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value || null })} />
          </Field>
        </div>
        <Field label="Instance">
          <input className="input" disabled={ro} value={form.instance} onChange={(e) => set({ instance: e.target.value })} placeholder="ex. Comité projet Build" />
        </Field>
        <Field label="Description">
          <textarea className="input" rows={4} disabled={ro} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Décision / mitigation">
          <textarea className="input" rows={3} disabled={ro} value={form.mitigation} onChange={(e) => set({ mitigation: e.target.value })} />
        </Field>
        <Field label="Cartes liées">
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line-soft p-2">
            {cards.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  disabled={ro}
                  checked={form.cardIds.includes(c.id)}
                  onChange={(e) => set({ cardIds: e.target.checked ? [...form.cardIds, c.id] : form.cardIds.filter((x) => x !== c.id) })}
                />
                <span className="text-xs text-muted">#{c.ref}</span> {c.title}
              </label>
            ))}
          </div>
        </Field>
        {!isNew && item && (
          <details className="rounded-xl border border-line-soft px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">Commentaires et historique</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Comments entityType="risk" entityId={item.id} />
              <History entityType="risk" entityId={item.id} />
            </div>
          </details>
        )}
      </div>
      {confirm.node}
    </Modal>
  );
}
