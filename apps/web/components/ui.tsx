"use client";

import { createPortal } from "react-dom";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { onToast } from "@/lib/api";
import { tone } from "@/lib/format";
import type { Option } from "@/lib/types";
import { Markdown, toggleCheckLine } from "./Markdown";
import { RichTextarea } from "./RichText";
import { IconChevronDown, IconInfo, IconX } from "./icons";

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-6 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

/** Pastille d'une valeur de liste (statut, niveau d'alerte, type...). */
export function Pill({ option, small = false, fallback }: { option?: Option | null; small?: boolean; fallback?: string }) {
  if (!option) return fallback ? <span className="text-xs text-muted">{fallback}</span> : null;
  const c = tone[option.color] ?? tone.slate;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${small ? "px-2 py-0.5 text-[0.68rem]" : "px-2.5 py-0.5 text-xs"}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}
    >
      {option.emoji && <span className="leading-none">{option.emoji}</span>}
      <span className="truncate">{option.label}</span>
    </span>
  );
}

export function Dot({ color, title }: { color: string; title?: string }) {
  return <span title={title} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone[color] ?? color }} />;
}

export function Toasts() {
  const [items, setItems] = useState<{ id: number; type: "error" | "success"; text: string }[]>([]);
  useEffect(() => {
    const off = onToast((m) => {
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { id, ...m }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), m.type === "error" ? 7000 : 3000);
    });
    return () => {
      off();
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[100] flex w-[min(92vw,460px)] -translate-x-1/2 flex-col gap-2 md:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          className="fadein pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-lg"
          style={{
            background: "var(--surface-2)",
            borderColor: t.type === "error" ? "var(--red)" : "var(--teal)",
            color: "var(--text)",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/**
 * Action d'enregistrement protégée contre le double envoi (double clic, Entrée maintenue) :
 * un second appel pendant que le premier est en cours est ignoré.
 */
export function useSubmit<A extends unknown[]>(fn: (...a: A) => Promise<unknown> | unknown) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (...a: A) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await fn(...a);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return [run, busy] as const;
}

/** Pile des fenêtres ouvertes (la dernière est au-dessus). */
const modalStack: symbol[] = [];

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const idRef = useRef(Symbol("modal"));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const me = idRef.current;
    modalStack.push(me);
    // Échap ne ferme que la fenêtre du dessus (une confirmation par-dessus une carte, par exemple)
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || modalStack[modalStack.length - 1] !== me) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      const i = modalStack.lastIndexOf(me);
      if (i >= 0) modalStack.splice(i, 1);
      // le défilement de la page n'est rendu qu'à la fermeture de la dernière fenêtre
      if (!modalStack.length) document.body.style.overflow = "";
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  // rendu à la racine du document : un parent avec effet de flou (en-tête) ne décale plus la fenêtre
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] md:items-center md:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        className={`fadein flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl md:rounded-2xl ${wide ? "md:max-w-4xl" : "md:max-w-xl"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0 flex-1 font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">{title}</div>
          <button className="btn btn-ghost btn-sm -mr-2" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[0.7rem] text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-ink-2 disabled:opacity-50"
    >
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-accent" : "bg-surface-3"}`} style={{ border: "1px solid var(--border)" }}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

/** Bloc repliable (modes d'emploi). */
export function Disclosure({ title, children, defaultOpen = false, icon }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; icon?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-line-soft bg-surface/60">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-ink-2" onClick={() => setOpen(!open)} aria-expanded={open}>
        {icon ?? <IconInfo className="text-muted" />}
        <span className="flex-1">{title}</span>
        <IconChevronDown className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line-soft px-4 py-3 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Callout({ text, icon = "💡" }: { text: string; icon?: string }) {
  if (!text?.trim()) return null;
  return (
    <div className="flex gap-3 rounded-xl border px-4 py-3 text-sm text-ink-2" style={{ background: "color-mix(in srgb, var(--petrol) 22%, transparent)", borderColor: "color-mix(in srgb, var(--petrol-2) 45%, transparent)" }}>
      <span className="text-base leading-6">{icon}</span>
      <Markdown text={text} className="flex-1" />
    </div>
  );
}

export function SectionTitle({ children, actions, icon }: { children: ReactNode; actions?: ReactNode; icon?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="section-title flex items-center gap-2">
        {icon && <span>{icon}</span>}
        {children}
      </h2>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Texte éditable au clic : sauvegarde à la sortie du champ (ou Ctrl+Entrée), Échap annule.
 * En multi-ligne, une barre de mise en forme accompagne la saisie et les cases à cocher sont cliquables en lecture.
 */
export function InlineText({
  value,
  onSave,
  multiline = false,
  placeholder = "Cliquer pour saisir…",
  disabled = false,
  className = "",
  render,
}: {
  value: string;
  onSave: (v: string) => Promise<unknown> | void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  render?: (v: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  // pendant la saisie, un rafraîchissement venu du serveur n'écrase pas ce qui est en cours de frappe
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  // cases à cocher : chaque clic part de la dernière valeur envoyée, pas d'une valeur pas encore rechargée
  const shown = useRef(value);
  const [local, setLocal] = useState(value);
  useEffect(() => {
    shown.current = value;
    setLocal(value);
  }, [value]);
  const toggle = (i: number) => {
    const next = toggleCheckLine(shown.current, i);
    shown.current = next;
    setLocal(next);
    onSave(next);
  };
  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);
  const commit = async () => {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setDraft(value);
      setEditing(false);
    }
    if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };
  if (editing && !disabled) {
    if (multiline)
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <RichTextarea ref={ref} rows={3} value={draft} onChange={setDraft} onBlur={commit} onKeyDown={onKeyDown} className={className} />
          <div className="mt-1 text-[0.65rem] text-muted">Ctrl+Entrée ou clic à l'extérieur pour enregistrer, Échap pour annuler.</div>
        </div>
      );
    return <input ref={ref} value={draft} className={`input ${className}`} onBlur={commit} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} />;
  }
  return (
    <div
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      onClick={() => !disabled && setEditing(true)}
      onKeyDown={(e) => !disabled && e.key === "Enter" && setEditing(true)}
      className={`min-h-[1.5rem] rounded-md ${disabled ? "" : "cursor-text hover:bg-surface-2/70"} ${className}`}
    >
      {local?.trim() ? (
        render ? (
          render(local)
        ) : (
          <Markdown text={local} onToggleCheck={disabled ? undefined : toggle} />
        )
      ) : !disabled ? (
        <span className="text-sm text-muted/70">{placeholder}</span>
      ) : (
        <span className="text-muted">-</span>
      )}
    </div>
  );
}

export function OptionSelect({
  options,
  value,
  onChange,
  placeholder = "Aucun",
  disabled,
  className = "",
  onCreate,
  createLabel = "Nouvelle valeur…",
}: {
  options: { id: string; label: string; emoji?: string }[];
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** création à la volée (comme une étiquette dans un outil de tickets) : renvoie l'identifiant créé */
  onCreate?: (label: string) => Promise<string | null | void>;
  createLabel?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const label = draft.trim();
    if (!label || !onCreate) return setCreating(false);
    setBusy(true);
    try {
      const id = await onCreate(label);
      if (id) onChange(id);
      setCreating(false);
      setDraft("");
    } finally {
      setBusy(false);
    }
  };
  if (creating)
    return (
      <div className={`flex gap-1 ${className}`}>
        <input
          className="input"
          autoFocus
          placeholder={createLabel.replace(/…$/, "")}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setCreating(false);
            }
          }}
        />
        <button type="button" className="btn btn-primary btn-sm shrink-0" disabled={busy || !draft.trim()} onClick={submit}>
          OK
        </button>
        <button type="button" className="btn btn-sm shrink-0" onClick={() => setCreating(false)} aria-label="Annuler">
          ✕
        </button>
      </div>
    );
  return (
    <select
      className={`input ${className}`}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setDraft("");
          setCreating(true);
          return;
        }
        onChange(e.target.value || null);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.emoji ? `${o.emoji} ` : ""}
          {o.label}
        </option>
      ))}
      {onCreate && <option value="__new__">+ {createLabel}</option>}
    </select>
  );
}

export function Confirm({ open, onClose, onConfirm, title, text, danger = true }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; text: string; danger?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className={`btn ${danger ? "" : "btn-primary"}`}
            style={danger ? { background: "var(--red)", borderColor: "var(--red)", color: "#fff" } : undefined}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Confirmer
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{text}</p>
    </Modal>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; text: string; action: () => void } | null>(null);
  const node = <Confirm open={!!state} onClose={() => setState(null)} onConfirm={() => state?.action()} title={state?.title ?? ""} text={state?.text ?? ""} />;
  return { ask: (title: string, text: string, action: () => void) => setState({ title, text, action }), node };
}
