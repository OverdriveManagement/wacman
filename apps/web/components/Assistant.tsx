"use client";

import { useRef, useState, useEffect } from "react";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import { useAcc } from "./AccountContext";
import { Markdown } from "./Markdown";
import { ErrorBoundary } from "./ErrorBoundary";
import { IconSend, IconSparkles, IconX } from "./icons";

type Msg = {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
  error?: string;
};

const TOOL_LABELS: Record<string, string> = {
  get_overview: "Lecture de la configuration du compte",
  list_cards: "Lecture des cartes",
  get_item: "Lecture d'un élément",
  list_items: "Lecture d'une liste",
  list_meetings: "Lecture des séances",
  search: "Recherche",
  get_dashboard: "Lecture des indicateurs",
  create_item: "Création",
  update_item: "Modification",
  delete_item: "Suppression",
  move_card: "Déplacement d'une carte",
  create_meeting: "Création d'une séance",
  switch_sprint: "Bascule de sprint",
  add_comment: "Ajout d'un commentaire",
};
const ENTITY_LABELS: Record<string, string> = {
  card: "carte",
  highlight: "fait marquant",
  streamStatus: "statut de stream",
  topic: "sujet",
  risk: "risque",
  meeting: "séance",
  stream: "stream",
  sprint: "sprint",
  option: "valeur de liste",
  contact: "contact",
  governance: "instance",
  meetingType: "type de séance",
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function Assistant({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const acc = useAcc();
  const { mutate } = useSWRConfig();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
    [msgs],
  );

  const suggestions = [
    "Résume les cartes en vigilance ou en alerte du sprint en cours.",
    "Prépare la prochaine séance de chaque type à partir de la précédente, à la date de lundi prochain.",
    "Quelles cartes arrivent à échéance dans les 15 prochains jours ?",
  ];

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const history = msgs
      .filter((m) => !m.error && m.content)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [
      ...m,
      { role: "user", content: prompt },
      { role: "assistant", content: "", steps: [] },
    ]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let changed = false;
    const update = (fn: (m: Msg) => Msg) =>
      setMsgs((list) =>
        list.map((m, i) => (i === list.length - 1 ? fn(m) : m)),
      );
    try {
      let url = `/api/accounts/${acc.data.account.slug}/assistant`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (API_URL) {
        const { token } = await api<{ token: string }>(
          "/api/auth/assistant-token",
        );
        url = `${API_URL}${url}`;
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt, history }),
        credentials: API_URL ? "omit" : "include",
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `Erreur ${res.status}`;
        try {
          msg = (await res.json()).error ?? msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue; // commentaires « : ping » de maintien de connexion
          let ev: {
            type?: string;
            delta?: string;
            name?: string;
            input?: { entity?: unknown };
            message?: string;
          };
          try {
            ev = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (ev.type === "text" && typeof ev.delta === "string") {
            const delta = ev.delta;
            update((m) => ({ ...m, content: m.content + delta }));
          } else if (ev.type === "tool") {
            const entity =
              typeof ev.input?.entity === "string" ? ev.input.entity : "";
            const ent = entity ? ` (${ENTITY_LABELS[entity] ?? entity})` : "";
            const name = String(ev.name ?? "");
            update((m) => ({
              ...m,
              steps: [...(m.steps ?? []), `${TOOL_LABELS[name] ?? name}${ent}`],
            }));
          } else if (ev.type === "action") changed = true;
          else if (ev.type === "error") {
            const message = String(ev.message ?? "Erreur de l'assistant.");
            update((m) => ({ ...m, error: message }));
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        update((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      if (changed)
        mutate((key) => typeof key === "string" && key.startsWith(acc.base));
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 md:bg-black/20"
      onClick={onClose}
    >
      <aside
        className="fadein flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl md:w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20 text-accent">
            <IconSparkles />
          </span>
          <div className="flex-1">
            <div className="font-display text-base font-bold text-ink">
              Assistant Claude
            </div>
            <div className="text-xs text-muted">
              {acc.data.account.name}, droits{" "}
              {acc.data.role === "VIEWER" ? "en lecture" : "d'édition"}
            </div>
          </div>
          {msgs.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setMsgs([])}
              disabled={busy}
            >
              Effacer
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Fermer"
          >
            <IconX />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!msgs.length && (
            <div className="space-y-3">
              <p className="text-sm text-ink-2">
                Demandez une synthèse, une mise à jour de cartes, la préparation
                d'une séance… L'assistant agit avec vos droits sur ce compte ;
                chaque modification est tracée dans le journal.
              </p>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    className="block w-full rounded-xl border border-line-soft bg-surface-2/60 px-3 py-2 text-left text-sm text-ink-2 hover:border-accent"
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ErrorBoundary label="Assistant" onReset={() => setMsgs([])}>
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div
                  key={i}
                  className="ml-8 rounded-2xl rounded-br-sm bg-accent-strong/90 px-3.5 py-2.5 text-sm text-white"
                  style={{ background: "var(--accent-strong)" }}
                >
                  <Markdown text={m.content} />
                </div>
              ) : (
                <div key={i} className="mr-4 space-y-2">
                  {!!m.steps?.length && (
                    <div className="flex flex-wrap gap-1">
                      {m.steps.map((s, j) => (
                        <span
                          key={j}
                          className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.68rem] text-muted"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.content ? (
                    <div className="rounded-2xl rounded-bl-sm border border-line-soft bg-surface-2/60 px-3.5 py-2.5 text-sm text-ink-2">
                      <Markdown text={m.content} />
                    </div>
                  ) : (
                    !m.error &&
                    busy &&
                    i === msgs.length - 1 && (
                      <div className="text-sm text-muted">
                        Réflexion en cours…
                      </div>
                    )
                  )}
                  {m.error && (
                    <div className="rounded-xl border border-red/50 px-3 py-2 text-sm text-red">
                      {m.error}
                    </div>
                  )}
                </div>
              ),
            )}
          </ErrorBoundary>
          <div ref={endRef} />
        </div>

        <form
          className="border-t border-line-soft p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              className="input max-h-40 min-h-[44px]"
              rows={1}
              placeholder="Votre demande…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            {busy ? (
              <button
                type="button"
                className="btn"
                onClick={() => abortRef.current?.abort()}
              >
                Arrêter
              </button>
            ) : (
              <button
                className="btn btn-primary"
                disabled={!input.trim()}
                aria-label="Envoyer"
              >
                <IconSend />
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
}
