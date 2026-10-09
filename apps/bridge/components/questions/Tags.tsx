"use client";

import { useRef, useState } from "react";
import type { Party, Question, QStatus } from "@/lib/types";
import { useCl, useQuestionActions } from "../ClientContext";
import { DateTag, Popover, TagMulti, TagSelect, type TagOption } from "../Tag";
import { isOverdue } from "@/lib/format";
import { useSubmit } from "../ui";

/** Étiquettes des questions : organisation, statut (avec les actions possibles), attribution, streams. */

export const partyColor = (p: Party | null | undefined) => (p === "PROVIDER" ? "var(--provider)" : p === "CLIENT" ? "var(--client)" : "var(--slate)");
export const STATUS_LABEL: Record<QStatus, string> = { OPEN: "À traiter", IN_PROGRESS: "En cours", CLOSED: "Clôturée" };
const STATUS_COLOR: Record<QStatus, string> = { OPEN: "var(--amber)", IN_PROGRESS: "var(--violet)", CLOSED: "var(--teal)" };
export const other = (p: Party): Party => (p === "PROVIDER" ? "CLIENT" : "PROVIDER");

function Chip({ color, children, title, strong = false }: { color: string; children: React.ReactNode; title?: string; strong?: boolean }) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold`}
      style={{ color, borderColor: `color-mix(in srgb, ${color} ${strong ? 55 : 40}%, transparent)`, background: `color-mix(in srgb, ${color} ${strong ? 18 : 12}%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function PartyTag({ party, muted = false }: { party: Party | null | undefined; muted?: boolean }) {
  const cl = useCl();
  if (!party) return null;
  return <Chip color={muted ? "var(--slate)" : partyColor(party)}>{cl.label(party)}</Chip>;
}

export function PartyDot({ party }: { party: Party }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: partyColor(party) }} aria-hidden />;
}

export function StatusChip({ status }: { status: QStatus }) {
  return <Chip color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Chip>;
}

/** Statut cliquable : clôturer, ou rouvrir en attribuant la question à l'une des organisations. */
export function StatusTag({ q }: { q: Question }) {
  const cl = useCl();
  const act = useQuestionActions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [run, busy] = useSubmit(async (fn: () => Promise<unknown>) => {
    setOpen(false);
    await fn();
  });
  const items: { label: string; onClick: () => Promise<unknown> }[] = [];
  if (q.status !== "CLOSED" && q.perms.close) items.push({ label: "Clôturer la question", onClick: () => act.close(q.id) });
  if (q.status === "CLOSED" && q.perms.reopenAs.length) {
    const as = q.perms.reopenAs.includes(cl.data.me.side) ? cl.data.me.side : q.perms.reopenAs[0];
    for (const p of [other(as), as]) items.push({ label: `Rouvrir et attribuer à ${cl.label(p)}`, onClick: () => act.reopen(q.id, { as, party: p }) });
  }
  const chip = <StatusChip status={q.status} />;
  if (!items.length || q.deletedAt) return chip;
  return (
    <>
      <button ref={ref} type="button" disabled={busy} className="rounded-full transition hover:brightness-125" onClick={(e) => (e.stopPropagation(), setOpen(true))} aria-label={`Statut : ${STATUS_LABEL[q.status]}, cliquer pour changer`} title="Cliquer pour changer le statut">
        {chip}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={250}>
        <div className="px-2 pb-1 pt-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Statut</div>
        {items.map((it) => (
          <button key={it.label} type="button" className="flex w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-surface-2" onClick={() => run(it.onClick)}>
            {it.label}
          </button>
        ))}
      </Popover>
    </>
  );
}

/** Organisation à qui la question est attribuée, modifiable si les droits le permettent. */
export function AssignTag({ q }: { q: Question }) {
  const cl = useCl();
  const act = useQuestionActions();
  if (q.status === "CLOSED") return <span className="text-xs text-muted">Clôturée</span>;
  const options: TagOption[] = (["PROVIDER", "CLIENT"] as Party[]).map((p) => ({ id: p, label: cl.label(p), color: p === "PROVIDER" ? "blue" : "ocre" }));
  if (!q.perms.reassign || q.deletedAt) return <PartyTag party={q.assignedParty} />;
  return <TagSelect label="Attribuée à" allowClear={false} options={options} value={q.assignedParty} onChange={(v) => v && act.assign(q.id, v as Party)} />;
}

/** Streams de la question : ceux que l'utilisateur ne peut pas modifier restent affichés mais grisés dans le choix. */
export function StreamsTag({ q, wrap = false }: { q: Question; wrap?: boolean }) {
  const cl = useCl();
  const act = useQuestionActions();
  const editable = new Set(q.perms.streams);
  const options: TagOption[] = cl.data.streams
    .filter((s) => s.active || q.streamIds.includes(s.id))
    .map((s) => ({
      id: s.id,
      label: s.active ? s.name : `${s.name} (inactif)`,
      emoji: s.emoji,
      color: "slate",
      disabled: !editable.has(s.id),
      hint: editable.has(s.id) ? undefined : "Hors de vos droits de modification",
    }));
  return (
    <TagMulti
      wrap={wrap}
      min={1}
      label="Streams"
      disabled={!editable.size || !!q.deletedAt}
      options={options}
      value={q.streamIds}
      onChange={(v) => v.length && act.update(q.id, { streamIds: v })}
    />
  );
}

/** Échéance souhaitée, modifiable par qui peut modifier la question ; en rouge si dépassée sur une question ouverte. */
export function DueTag({ q, small = false, emptyLabel }: { q: Question; small?: boolean; emptyLabel?: string }) {
  const act = useQuestionActions();
  const late = q.status !== "CLOSED" && isOverdue(q.dueDate);
  return <DateTag small={small} label="Échéance" emptyLabel={emptyLabel} disabled={!q.perms.edit || !!q.deletedAt} value={q.dueDate} danger={late} onChange={(v) => act.update(q.id, { dueDate: v })} />;
}
