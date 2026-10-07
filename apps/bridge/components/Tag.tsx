"use client";

/**
 * Étiquettes cliquables (à la manière de Notion, Linear ou Jira) : la valeur s'affiche comme une simple étiquette,
 * sans flèche ni cadre de liste ; un clic ouvre un petit menu de choix. Une étiquette vide n'est qu'une pastille
 * discrète « + ». En lecture seule, seule la valeur s'affiche.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { frDate, tone } from "@/lib/format";

/**
 * hidden : valeur retirée (stream désactivé), affichée si elle est déjà choisie mais plus proposée ;
 * disabled : valeur visible mais que l'utilisateur ne peut pas cocher ou décocher (stream hors de ses droits).
 */
export type TagOption = { id: string; label: string; emoji?: string; color?: string; hidden?: boolean; disabled?: boolean; hint?: string };

export function Popover({ anchor, open, onClose, width = 240, children }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: (reason?: "escape") => void; width?: number; children: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const up = r.bottom + 320 > window.innerHeight && r.top > 320;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left)), up });
  }, [open, anchor, width]);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose("escape"));
    // la page ou une fenêtre défile (y compris un défilement encore en cours au moment du clic) : le menu suit
    // son étiquette, et ne se ferme que si l'étiquette sort de l'écran
    const follow = (e: Event) => {
      if (e.target instanceof Node && document.getElementById("wib-popover")?.contains(e.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = anchor.current;
        if (!el || !el.isConnected) return onClose();
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return onClose();
        setPos((p) => p && { ...p, top: p.up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - width - 8, r.left)) });
      });
    };
    const close = () => onClose();
    window.addEventListener("keydown", esc, true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", close);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", esc, true);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", close);
    };
  }, [open, onClose, anchor, width]);
  if (!open || !pos) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80]" onMouseDown={() => onClose()} onClick={(e) => e.stopPropagation()}>
      <div
        id="wib-popover"
        role="dialog"
        className="fadein absolute max-h-[320px] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-2xl"
        style={{ left: pos.left, width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Pastille discrète pour ajouter une valeur à une étiquette vide. */
function EmptyDot({ label, onClick, btnRef }: { label: string; onClick: () => void; btnRef: RefObject<HTMLButtonElement | null> }) {
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-dashed border-line text-[0.7rem] leading-none text-muted opacity-50 transition hover:border-accent hover:text-accent hover:opacity-100 focus:opacity-100"
      title={`Ajouter : ${label}`}
      aria-label={`Ajouter : ${label}`}
    >
      +
    </button>
  );
}

export function TagView({ o, variant, className = "" }: { o: TagOption; variant: "pill" | "text"; className?: string }) {
  if (variant === "pill" && o.color)
    return (
      <span
        className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${className}`}
        style={{ color: tone[o.color], borderColor: `color-mix(in srgb, ${tone[o.color]} 40%, transparent)`, background: `color-mix(in srgb, ${tone[o.color]} 12%, transparent)` }}
      >
        {o.emoji && <span>{o.emoji}</span>}
        <span className="truncate">{o.label}</span>
      </span>
    );
  return (
    <span className={`inline-flex max-w-full items-center gap-1 truncate ${className}`}>
      {o.emoji && <span>{o.emoji}</span>}
      <span className="truncate">{o.label}</span>
    </span>
  );
}

function OptionList({
  options,
  isOn,
  onPick,
  onClear,
  clearLabel,
  onCreate,
  createLabel,
  multi = false,
}: {
  options: TagOption[];
  isOn: (id: string) => boolean;
  onPick: (id: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  onCreate?: (label: string) => Promise<string | null | void>;
  createLabel?: string;
  multi?: boolean;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = options.filter((o) => (!o.hidden || isOn(o.id)) && (!q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase())));
  const create = async () => {
    const label = (creating ? q : "").trim();
    if (!label || !onCreate) return;
    setBusy(true);
    try {
      const id = await onCreate(label);
      if (id) onPick(id);
    } finally {
      setBusy(false);
      setCreating(false);
      setQ("");
    }
  };
  return (
    <div>
      {(options.length > 7 || creating) && (
        <input
          autoFocus
          className="input mb-1 !py-1 text-sm"
          placeholder={creating ? createLabel?.replace(/…$/, "") : "Rechercher…"}
          value={q}
          disabled={busy}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (creating) create();
              else {
                const first = list.find((o) => !o.disabled);
                if (first) onPick(first.id);
              }
            }
          }}
        />
      )}
      {!creating &&
        list.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={o.disabled}
            title={o.hint}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${isOn(o.id) ? "bg-surface-2/70" : ""}`}
            onClick={() => !o.disabled && onPick(o.id)}
          >
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center text-[0.7rem] ${multi ? "rounded border border-line" : ""} ${isOn(o.id) ? "text-accent" : "text-transparent"}`}>✓</span>
            <TagView o={o} variant="pill" />
          </button>
        ))}
      {!creating && !list.length && <div className="px-2 py-1.5 text-sm text-muted">Aucun résultat.</div>}
      {!creating && onClear && (
        <button type="button" className="mt-1 w-full rounded-lg border-t border-line-soft px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-2" onClick={onClear}>
          {clearLabel ?? "Retirer"}
        </button>
      )}
      {onCreate &&
        (creating ? (
          <div className="flex gap-1 px-1 pb-1">
            <button type="button" className="btn btn-primary btn-sm flex-1" disabled={busy || !q.trim()} onClick={create}>
              Créer
            </button>
            <button type="button" className="btn btn-sm" onClick={() => (setCreating(false), setQ(""))}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-accent hover:bg-surface-2" onClick={() => (setCreating(true), setQ(""))}>
            + {createLabel ?? "Nouvelle valeur…"}
          </button>
        ))}
    </div>
  );
}

/** Étiquette à valeur unique (statut, type, stream, porteur…). */
export function TagSelect({
  options,
  value,
  onChange,
  label,
  disabled,
  onCreate,
  createLabel,
  variant = "pill",
  className = "",
  allowClear = true,
}: {
  options: TagOption[];
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  label: string;
  disabled?: boolean;
  onCreate?: (label: string) => Promise<string | null | void>;
  createLabel?: string;
  variant?: "pill" | "text";
  className?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const current = value ? options.find((o) => o.id === value) : undefined;
  if (disabled) return current ? <TagView o={current} variant={variant} className={className} /> : null;
  return (
    <>
      {current ? (
        <button
          ref={ref}
          type="button"
          className="max-w-full rounded-full text-left transition hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={`${label} : cliquer pour changer`}
          aria-label={`${label} : ${current.label}`}
        >
          <TagView o={current} variant={variant} className={className} />
        </button>
      ) : (
        <EmptyDot label={label} onClick={() => setOpen(true)} btnRef={ref} />
      )}
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)}>
        <div className="px-2 pb-1 pt-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{label}</div>
        <OptionList
          options={options}
          isOn={(id) => id === value}
          onPick={(id) => {
            setOpen(false);
            if (id !== value) onChange(id);
          }}
          onClear={allowClear && value ? () => (setOpen(false), onChange(null)) : undefined}
          onCreate={onCreate}
          createLabel={createLabel}
        />
      </Popover>
    </>
  );
}

/** Étiquettes à valeurs multiples (statuts d'un stream en séance). */
export function TagMulti({
  options,
  value: saved,
  onChange,
  label,
  disabled,
  onCreate,
  createLabel,
  wrap = false,
  min = 0,
}: {
  options: TagOption[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  disabled?: boolean;
  onCreate?: (label: string) => Promise<string | null | void>;
  createLabel?: string;
  /** étiquettes à la suite (sinon l'une sous l'autre) */
  wrap?: boolean;
  /** nombre minimal de valeurs cochées (le dernier choix ne se décoche pas) */
  min?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  // clics rapides : chaque choix part de la dernière valeur envoyée, sans attendre le rechargement
  const [value, setValue] = useState(saved);
  const last = useRef(saved);
  const savedKey = saved.join(",");
  useEffect(() => {
    last.current = saved;
    setValue(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const pick = (id: string) => {
    if (last.current.includes(id) && last.current.length <= min) return;
    const next = last.current.includes(id) ? last.current.filter((x) => x !== id) : [...last.current, id];
    last.current = next;
    setValue(next);
    onChange(next);
  };
  const selected = value.map((id) => options.find((o) => o.id === id)).filter(Boolean) as TagOption[];
  const box = wrap ? "flex flex-wrap items-center gap-1" : "flex flex-col items-start gap-1";
  if (disabled)
    return (
      <div className={`${box} max-w-full`}>
        {selected.map((o) => (
          <TagView key={o.id} o={o} variant="pill" />
        ))}
      </div>
    );
  return (
    <>
      {selected.length ? (
        <button
          ref={ref}
          type="button"
          className={`${box} max-w-full rounded-lg text-left transition hover:brightness-125`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          title={`${label} : cliquer pour changer`}
          aria-label={`${label} : ${selected.map((o) => o.label).join(", ")}`}
        >
          {selected.map((o) => (
            <TagView key={o.id} o={o} variant="pill" />
          ))}
        </button>
      ) : (
        <EmptyDot label={label} onClick={() => setOpen(true)} btnRef={ref} />
      )}
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)}>
        <div className="px-2 pb-1 pt-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{label}</div>
        <OptionList
          multi
          options={options}
          isOn={(id) => value.includes(id)}
          onPick={pick}
          onCreate={onCreate}
          createLabel={createLabel}
        />
      </Popover>
    </>
  );
}

/** Date affichée comme une étiquette ; un clic ouvre un petit sélecteur (avec « Effacer »). */
export function DateTag({ value, onChange, label, disabled, min, max, danger, small = false }: { value: string | null; onChange: (v: string | null) => void; label: string; disabled?: boolean; min?: string | null; max?: string | null; danger?: boolean; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  // la date saisie n'est enregistrée qu'à la fermeture (OK, Entrée, clic à l'extérieur), pas à chaque chiffre tapé
  const draft = useRef<string>(value ?? "");
  const show = () => {
    draft.current = value ?? "";
    setOpen(true);
  };
  const close = (reason?: "escape") => {
    setOpen(false);
    const v = draft.current;
    if (reason !== "escape" && v && v.length === 10 && v >= "1900" && v !== value) onChange(v);
  };
  const text = <span className={`whitespace-nowrap ${small ? "text-xs" : "text-sm"} ${danger ? "font-semibold text-red" : "text-ink-2"}`}>{frDate(value)}</span>;
  if (disabled) return value ? text : <span className="text-sm text-muted">-</span>;
  return (
    <>
      {value ? (
        <button ref={ref} type="button" className="rounded-md px-1 py-0.5 -mx-1 transition hover:bg-surface-2" onClick={show} title={`${label} : cliquer pour changer`} aria-label={`${label} : ${frDate(value)}`}>
          {text}
        </button>
      ) : (
        <EmptyDot label={label} onClick={show} btnRef={ref} />
      )}
      <Popover anchor={ref} open={open} onClose={close} width={220}>
        <div className="space-y-2 p-1.5">
          <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{label}</div>
          <input
            type="date"
            autoFocus
            className="input"
            defaultValue={value ?? ""}
            min={min ?? undefined}
            max={max ?? undefined}
            onChange={(e) => {
              draft.current = e.target.value;
            }}
            onKeyDown={(e) => e.key === "Enter" && close()}
          />
          <div className="flex justify-between gap-2">
            {value ? (
              <button type="button" className="text-xs text-muted hover:text-red" onClick={() => ((draft.current = value ?? ""), setOpen(false), onChange(null))}>
                Effacer
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn-sm" onClick={() => close()}>
              OK
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
