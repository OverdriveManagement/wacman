"use client";

import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import { fetcher, toast } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import type { Message, Party, QuestionDetail } from "@/lib/types";
import { useCl, useQuestionActions } from "../ClientContext";
import { initials } from "../TopBar";
import { Markdown } from "../Markdown";
import { RichTextarea } from "../RichText";
import { InlineText, Spinner, useSubmit } from "../ui";
import { AttachedFiles, PendingFiles, usePendingFiles } from "./Attachments";
import { PartyTag, other, partyColor } from "./Tags";

/** Fil d'échanges d'une question : la question, chaque réponse avec son issue, puis la zone de réponse. */

// brouillons de réponse gardés le temps de la visite (une ligne repliée puis rouverte ne perd rien)
const drafts = new Map<string, string>();

function Avatar({ name, party }: { name: string; party: Party }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-bold text-white" style={{ background: partyColor(party) }} aria-hidden>
      {initials(name || "?")}
    </span>
  );
}

function OutcomeBadge({ m }: { m: Message }) {
  const cl = useCl();
  let text: string;
  let color: string;
  if (m.outcome === "CLOSE") {
    text = "Question clôturée";
    color = "var(--teal)";
  } else if (m.outcome === "REOPEN") {
    text = `Rouverte, attribuée à ${cl.label(m.assignedAfter)}`;
    color = partyColor(m.assignedAfter);
  } else if (m.assignedAfter === m.assignedBefore) {
    text = `Attribution conservée (${cl.label(m.assignedAfter)})`;
    color = "var(--slate)";
  } else {
    text = `Attribuée à ${cl.label(m.assignedAfter)}`;
    color = partyColor(m.assignedAfter);
  }
  return (
    <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}>
      {text}
    </span>
  );
}

function Bubble({ party, children }: { party: Party; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface px-3 py-2.5" style={{ borderLeft: `3px solid ${partyColor(party)}` }}>
      {children}
    </div>
  );
}

export function Thread({ id }: { id: string }) {
  const cl = useCl();
  const { data: d, error } = useSWR<QuestionDetail>(`${cl.base}/questions/${id}`, fetcher, { refreshInterval: 60_000 });
  const act = useQuestionActions();
  if (error && !d) return <p className="px-4 py-3 text-sm text-red">{(error as Error).message}</p>;
  if (!d) return <Spinner label="Chargement des échanges…" />;
  const qFiles = d.files.filter((f) => !f.messageId);
  return (
    <div className="space-y-2.5 px-3 py-3 md:px-5" data-thread={d.ref}>
      {/* la question */}
      <div className="flex gap-2.5">
        <Avatar name={d.askedBy.name} party={d.askedByParty} />
        <div className="min-w-0 flex-1">
          <Bubble party={d.askedByParty}>
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="font-semibold text-ink-2">{d.askedBy.name || "Utilisateur supprimé"}</span>
              <PartyTag party={d.askedByParty} />
              <span title={dateTime(d.createdAt)}>a posé la question le {dateTime(d.createdAt)}</span>
            </div>
            <InlineText
              multiline
              disabled={!d.perms.edit || !!d.deletedAt}
              value={d.body}
              placeholder="Ajouter le texte de la question…"
              className="text-sm text-ink-2"
              onSave={(v) => act.update(d.id, { body: v })}
            />
            <AttachedFiles questionId={d.id} files={qFiles} canAdd={d.perms.edit && !d.deletedAt} />
          </Bubble>
        </div>
      </div>

      {d.messages.map((m) => (
        <div key={m.id} className="flex gap-2.5" data-message-id={m.id}>
          <Avatar name={m.authorName} party={m.party} />
          <div className="min-w-0 flex-1">
            <Bubble party={m.party}>
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className="font-semibold text-ink-2">{m.authorName || "Utilisateur supprimé"}</span>
                <PartyTag party={m.party} />
                <span title={dateTime(m.createdAt)}>{dateTime(m.createdAt)}</span>
                <OutcomeBadge m={m} />
                {m.editedAt && <span title={`Modifié le ${dateTime(m.editedAt)}`}>(modifié)</span>}
              </div>
              <InlineText
                multiline
                disabled={!m.perms.edit}
                value={m.body}
                placeholder="Ajouter un texte…"
                className="text-sm text-ink-2"
                onSave={(v) => act.editMessage(m.id, v)}
              />
              <AttachedFiles questionId={d.id} messageId={m.id} files={d.files.filter((f) => f.messageId === m.id)} canAdd={m.perms.edit} />
            </Bubble>
          </div>
        </div>
      ))}

      <Composer d={d} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, stack = false }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; color?: string }[]; label: string; stack?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">{label}</span>
      <div className={`rounded-lg border border-line p-0.5 ${stack ? "flex w-full flex-col sm:inline-flex sm:w-auto sm:flex-row" : "inline-flex flex-wrap"}`} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-md px-2.5 py-1 font-semibold transition ${value === o.id ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
            style={value === o.id && o.color ? { color: o.color } : undefined}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer({ d }: { d: QuestionDetail }) {
  const cl = useCl();
  const act = useQuestionActions();
  const pending = usePendingFiles();
  const [body, setBodyState] = useState(drafts.get(d.id) ?? "");
  const setBody = (v: string) => {
    drafts.set(d.id, v);
    setBodyState(v);
  };
  const respondAs = d.perms.respondAs;
  const side = cl.data.me.side;
  const [party, setParty] = useState<Party>(respondAs.includes(side) ? side : (respondAs[0] ?? side));
  // issue par défaut : l'attributaire renvoie sa réponse à l'autre organisation ; une relance garde l'attribution
  const defaultOutcome = (p: Party): Party | "CLOSE" => (p === d.assignedParty ? other(d.assignedParty) : d.assignedParty);
  const [outcome, setOutcome] = useState<Party | "CLOSE">(defaultOutcome(party));
  const [reopening, setReopening] = useState(false);
  const reopenAs = d.perms.reopenAs;
  const [as, setAs] = useState<Party>(reopenAs.includes(side) ? side : (reopenAs[0] ?? side));
  const [target, setTarget] = useState<Party>(other(as));
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!respondAs.includes(party) && respondAs.length) setParty(respondAs.includes(side) ? side : respondAs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respondAs.join(",")]);
  // après un envoi (nouvelle attribution, nouveau message), l'issue revient à sa valeur par défaut
  useEffect(() => {
    setOutcome(defaultOutcome(party));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.assignedParty, d.messages.length]);

  const [send, sending] = useSubmit(async () => {
    if (!body.trim() && !pending.files.length) return toast("error", "Écrivez une réponse ou joignez un fichier.");
    const before = d.assignedParty;
    await act.respond(d.id, { body, party, outcome, fileIds: pending.files.map((f) => f.id) });
    drafts.delete(d.id);
    setBodyState("");
    pending.clear();
    toast(
      "success",
      outcome === "CLOSE"
        ? "Réponse envoyée, question clôturée."
        : outcome === before
          ? `Réponse envoyée, attribution conservée (${cl.label(outcome)}).`
          : `Réponse envoyée, question attribuée à ${cl.label(outcome)}.`,
    );
  });
  const [reopen, reopenBusy] = useSubmit(async () => {
    await act.reopen(d.id, { as, party: target, body, fileIds: pending.files.map((f) => f.id) });
    drafts.delete(d.id);
    setBodyState("");
    pending.clear();
    setReopening(false);
    toast("success", `Question rouverte et attribuée à ${cl.label(target)}.`);
  });

  if (d.deletedAt) {
    return (
      <div className="rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted">
        Question supprimée.
        {d.perms.restore && (
          <button className="btn btn-sm ml-3" onClick={() => act.restore(d.id)}>
            Restaurer
          </button>
        )}
      </div>
    );
  }

  if (d.status === "CLOSED") {
    return (
      <div className="rounded-xl border border-line-soft bg-surface/70 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span>
            Question clôturée{d.closedAt ? ` le ${dateTime(d.closedAt)}` : ""}
            {d.closedByName ? ` par ${d.closedByName}` : ""}.
          </span>
          {reopenAs.length > 0 && !reopening && (
            <button className="btn btn-sm" onClick={() => setReopening(true)}>
              Rouvrir la question
            </button>
          )}
        </div>
        {reopening && (
          <div className="mt-2 space-y-2">
            {reopenAs.length > 1 && (
              <Segmented
                label="Au nom de"
                value={as}
                onChange={(v) => {
                  setAs(v);
                  setTarget(other(v));
                }}
                options={reopenAs.map((p) => ({ id: p, label: cl.label(p), color: partyColor(p) }))}
              />
            )}
            <RichTextarea compact rows={2} value={body} onChange={setBody} placeholder="Motif de la réouverture (facultatif)…" />
            <PendingFiles p={pending} />
            <Segmented label="Attribuer à" value={target} onChange={setTarget} options={(["PROVIDER", "CLIENT"] as Party[]).map((p) => ({ id: p, label: cl.label(p), color: partyColor(p) }))} />
            <div className="flex justify-end gap-2">
              <button className="btn btn-sm" onClick={() => setReopening(false)}>
                Annuler
              </button>
              <button className="btn btn-primary btn-sm" disabled={reopenBusy} onClick={() => reopen()}>
                Rouvrir et attribuer à {cl.label(target)}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!respondAs.length) {
    const ro = !cl.data.streams.some((s) => ["CLIENT", "PROVIDER", "BOTH"].includes(cl.access(s.id))) && !cl.data.me.isSuperAdmin;
    return (
      <div className="rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted">
        {ro ? "Votre accès est en lecture seule." : `Question attribuée à ${cl.label(d.assignedParty)} : vous pourrez y répondre quand elle sera attribuée à votre organisation.`}
      </div>
    );
  }

  // l'autre organisation d'abord, puis conserver, puis clôturer
  const outcomes: { id: Party | "CLOSE"; label: string; color?: string }[] = [
    { id: other(d.assignedParty), label: `Attribuer à ${cl.label(other(d.assignedParty))}`, color: partyColor(other(d.assignedParty)) },
    { id: d.assignedParty, label: `Conserver l'attribution (${cl.label(d.assignedParty)})`, color: partyColor(d.assignedParty) },
    { id: "CLOSE", label: "Clôturer", color: "var(--teal)" },
  ];

  return (
    <div className="flex gap-2.5">
      <span className="hidden w-8 shrink-0 sm:block" />
      <div className="min-w-0 flex-1 space-y-2 rounded-xl border border-line bg-surface px-3 py-3" onClick={(e) => e.stopPropagation()}>
        {respondAs.length > 1 && (
          <Segmented
            label="Répondre au nom de"
            value={party}
            onChange={(v) => {
              setParty(v);
              setOutcome(defaultOutcome(v));
            }}
            options={respondAs.map((p) => ({ id: p, label: cl.label(p), color: partyColor(p) }))}
          />
        )}
        <RichTextarea
          ref={box}
          rows={3}
          value={body}
          onChange={setBody}
          placeholder={party === d.assignedParty ? "Votre réponse…" : `Message à ${cl.label(d.assignedParty)} (relance, précision, éléments complémentaires)…`}
          aria-label="Votre réponse"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <PendingFiles p={pending} />
        <div className="flex flex-col gap-2 border-t border-line-soft pt-2 sm:flex-row sm:items-center sm:justify-between">
          <Segmented stack label="Issue" value={outcome} onChange={setOutcome} options={outcomes} />
          <button className="btn btn-primary btn-sm self-end sm:self-auto" disabled={sending} onClick={() => send()}>
            {sending ? "Envoi…" : outcome === "CLOSE" ? "Envoyer et clôturer" : "Envoyer"}
          </button>
        </div>
        <p className="text-[0.68rem] text-muted">
          Ctrl+Entrée pour envoyer. {outcome === "CLOSE" ? "La question sera clôturée (elle pourra être rouverte)." : outcome === d.assignedParty ? `La question reste attribuée à ${cl.label(outcome)}.` : `La question sera attribuée à ${cl.label(outcome)}.`}
          {d.lastMessage ? ` Dernier échange ${relative(d.lastMessage.createdAt)}.` : ""}
        </p>
      </div>
    </div>
  );
}

export function QuestionText({ text }: { text: string }) {
  return <Markdown text={text} className="text-sm text-ink-2" />;
}
