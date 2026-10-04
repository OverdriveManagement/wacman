"use client";

/**
 * Paramétrage « en place » : menus contextuels et fenêtres légères pour créer ou modifier
 * sprints, streams et valeurs de listes directement depuis les écrans (comme dans les outils de tickets).
 * Les droits restent contrôlés par l'API : ces éléments ne s'affichent qu'aux administrateurs du compte.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, toast } from "@/lib/api";
import { COLORS, tone } from "@/lib/format";
import type { Option, OptionKind, Sprint, Stream } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Field, Modal, Toggle, useConfirm } from "./ui";
import { IconTrash } from "./icons";
import { RichField } from "./RichText";

// ---------------------------------------------------------------------------
// Menu contextuel « ⋯ »
// ---------------------------------------------------------------------------

export type MenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode } | "sep";

/** Bouton « ⋯ » qui ouvre un petit menu ; rendu à la racine pour ne pas être rogné par un tableau défilant. */
export function Menu({ items, label = "Options", className = "", trigger }: { items: MenuItem[]; label?: string; className?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = 230;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const visible = items.filter((i) => i === "sep" || !i.disabled);
  if (!visible.some((i) => i !== "sep")) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={trigger ? className : `inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-ink ${className}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {trigger ?? <span className="text-lg leading-none">⋯</span>}
      </button>
      {open &&
        pos &&
        createPortal(
          <div className="fixed inset-0 z-[70]" onMouseDown={() => setOpen(false)}>
            <div
              role="menu"
              className="fadein absolute w-[230px] rounded-xl border border-line bg-surface p-1 shadow-2xl"
              style={{ top: pos.top, left: pos.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {visible.map((it, i) =>
                it === "sep" ? (
                  <div key={i} className="my-1 h-px bg-line-soft" />
                ) : (
                  <button
                    key={i}
                    role="menuitem"
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 ${it.danger ? "text-red" : "text-ink-2"}`}
                    onClick={() => {
                      setOpen(false);
                      it.onClick();
                    }}
                  >
                    {it.icon}
                    {it.label}
                  </button>
                ),
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Petit bouton « + » discret pour les ajouts en place. */
export function AddButton({ onClick, label, children }: { onClick: () => void; label: string; children?: ReactNode }) {
  return (
    <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface-2 hover:text-accent" onClick={onClick} title={label} aria-label={label}>
      <span className="text-base leading-none">+</span>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sprint
// ---------------------------------------------------------------------------

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function SprintModal({ item, onClose, onSaved }: { item: Sprint | "new" | null; onClose: () => void; onSaved?: (s: Sprint) => void }) {
  const acc = useAcc();
  const confirm = useConfirm();
  const sprints = [...acc.data.sprints].sort((a, b) => a.order - b.order);
  const last = sprints[sprints.length - 1];
  const blank = () => {
    // nouveau sprint : enchaîné au dernier, même durée
    const len = last?.startDate && last?.endDate ? Math.round((Date.parse(last.endDate) - Date.parse(last.startDate)) / 86_400_000) : 27;
    const start = last?.endDate ? addDays(last.endDate, 1) : null;
    return { name: `Sprint ${sprints.length + 1}`, startDate: start, endDate: start ? addDays(start, len) : null, state: "UPCOMING" as Sprint["state"], objective: "", clientMilestone: "" };
  };
  const [f, setF] = useState(blank());
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setF(item && item !== "new" ? { name: item.name, startDate: item.startDate, endDate: item.endDate, state: item.state, objective: item.objective, clientMilestone: item.clientMilestone } : blank());
  }
  const save = async () => {
    if (!f.name.trim()) return toast("error", "Le nom du sprint est obligatoire.");
    if (f.startDate && f.endDate && f.startDate > f.endDate) return toast("error", "La fin doit suivre le début.");
    const data = { ...f, name: f.name.trim() };
    const s =
      item === "new"
        ? await api<Sprint>(`${acc.base}/e/sprint`, { method: "POST", json: { ...data, order: (last?.order ?? 0) + 1 } })
        : await api<Sprint>(`${acc.base}/e/sprint/${(item as Sprint).id}`, { method: "PATCH", json: data });
    toast("success", item === "new" ? `${s.name} créé.` : "Sprint enregistré.");
    await acc.mutate();
    onSaved?.(s);
    onClose();
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item === "new" ? "Nouveau sprint" : "Sprint"}
      footer={
        <>
          {item && item !== "new" && (
            <button
              className="btn btn-danger mr-auto"
              onClick={() =>
                confirm.ask("Supprimer le sprint", `${item.name} sera supprimé ; ses cartes restent, sans sprint.`, async () => {
                  await api(`${acc.base}/e/sprint/${item.id}`, { method: "DELETE" });
                  await acc.mutate();
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
            {item === "new" ? "Créer le sprint" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
          <Field label="Nom">
            <input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="État">
            <select className="input" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value as Sprint["state"] })}>
              <option value="UPCOMING">À venir</option>
              <option value="CURRENT">En cours</option>
              <option value="DONE">Terminé</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Début">
            <input className="input" type="date" value={f.startDate ?? ""} onChange={(e) => setF({ ...f, startDate: e.target.value || null })} />
          </Field>
          <Field label="Fin">
            <input className="input" type="date" value={f.endDate ?? ""} onChange={(e) => setF({ ...f, endDate: e.target.value || null })} />
          </Field>
        </div>
        <Field label="Objectif">
          <RichField rows={2} compact value={f.objective} onChange={(v) => setF({ ...f, objective: v })} />
        </Field>
        <Field label={`Échéance ${acc.data.account.clientName}`}>
          <RichField rows={2} compact value={f.clientMilestone} onChange={(v) => setF({ ...f, clientMilestone: v })} />
        </Field>
      </div>
      {confirm.node}
    </Modal>
  );
}

/** Bascule du sprint en cours vers le suivant (cartes non terminées reportées). */
export function useSprintSwitch() {
  const acc = useAcc();
  const confirm = useConfirm();
  const sprints = [...acc.data.sprints].sort((a, b) => a.order - b.order);
  const current = sprints.find((x) => x.state === "CURRENT");
  const next = current ? sprints.find((x) => x.order > current.order && x.state !== "DONE") : sprints.find((x) => x.state === "UPCOMING");
  const ask = () => {
    if (!current || !next) return;
    confirm.ask("Basculer au sprint suivant", `${current.name} passe à Terminé, ${next.name} à En cours, et les cartes non terminées de ${current.name} sont reportées dans ${next.name}.`, async () => {
      const r = await api<{ moved: number }>(`${acc.base}/sprints/switch`, { method: "POST", json: { fromSprintId: current.id, toSprintId: next.id } });
      toast("success", `${r.moved} carte(s) reportée(s) dans ${next.name}.`);
      await acc.mutate();
    });
  };
  return { current, next, ask, node: confirm.node, possible: !!(current && next) };
}

// ---------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------

export function StreamModal({ item, onClose }: { item: Stream | "new" | null; onClose: () => void }) {
  const acc = useAcc();
  const confirm = useConfirm();
  const labels = acc.data.account.settings.labels;
  const blank = { name: "", emoji: "", leader: "", prescriber: "", active: true, inKanban: true, inStatusTemplate: true, inDirectory: true };
  const [f, setF] = useState(blank);
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setF(item && item !== "new" ? { name: item.name, emoji: item.emoji, leader: item.leader, prescriber: item.prescriber, active: item.active, inKanban: item.inKanban, inStatusTemplate: item.inStatusTemplate, inDirectory: item.inDirectory } : blank);
  }
  const save = async () => {
    if (!f.name.trim()) return toast("error", "Le nom du stream est obligatoire.");
    const data = { ...f, name: f.name.trim() };
    if (item === "new") await api(`${acc.base}/e/stream`, { method: "POST", json: { ...data, order: Math.max(0, ...acc.data.streams.map((s) => s.order)) + 1 } });
    else if (item) await api(`${acc.base}/e/stream/${item.id}`, { method: "PATCH", json: data });
    toast("success", item === "new" ? "Stream créé." : "Stream enregistré.");
    await acc.mutate();
    onClose();
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item === "new" ? "Nouveau stream" : "Stream"}
      footer={
        <>
          {item && item !== "new" && (
            <button
              className="btn btn-danger mr-auto"
              onClick={() =>
                confirm.ask("Supprimer le stream", `Le stream « ${item.name} » sera supprimé ; ses cartes restent, sans stream.`, async () => {
                  await api(`${acc.base}/e/stream/${item.id}`, { method: "DELETE" });
                  await acc.mutate();
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
            {item === "new" ? "Créer le stream" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 grid-cols-[80px_1fr]">
          <Field label="Picto">
            <input className="input text-center" maxLength={8} value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} placeholder="🚚" />
          </Field>
          <Field label="Nom du stream">
            <input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={labels.leader}>
            <input className="input" value={f.leader} onChange={(e) => setF({ ...f, leader: e.target.value })} />
          </Field>
          <Field label={labels.prescriber}>
            <input className="input" value={f.prescriber} onChange={(e) => setF({ ...f, prescriber: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle checked={f.inKanban} onChange={(v) => setF({ ...f, inKanban: v })} label="Couloir du kanban et du planning" />
          <Toggle checked={f.inStatusTemplate} onChange={(v) => setF({ ...f, inStatusTemplate: v })} label="Ligne de séance (statut des streams)" />
          <Toggle checked={f.inDirectory} onChange={(v) => setF({ ...f, inDirectory: v })} label="Annuaire de la gouvernance" />
          <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Actif" />
        </div>
      </div>
      {confirm.node}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Valeur de liste (colonne du kanban, niveau d'alerte, type…)
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<OptionKind, string> = {
  CARD_STATUS: "Colonne du kanban",
  ALERT_LEVEL: "Niveau de vigilance ou d'alerte",
  HIGHLIGHT_TYPE: "Type de fait marquant",
  STREAM_STATUS: "Statut de stream",
  TOPIC_THEME: "Thématique de sujet",
  TOPIC_NATURE: "Nature de sujet",
  RISK_TYPE: "Type de risque",
  RISK_STATUS: "Statut de risque",
  RISK_CRITICALITY: "Criticité",
};

export function OptionModal({ item, kind, onClose, onSaved }: { item: Option | "new" | null; kind: OptionKind; onClose: () => void; onSaved?: (o: Option) => void }) {
  const acc = useAcc();
  const confirm = useConfirm();
  const blank = { label: "", emoji: "", color: "slate", meta: {} as Option["meta"] };
  const [f, setF] = useState(blank);
  const [key, setKey] = useState("");
  const k = item === "new" ? `new-${kind}` : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setF(item && item !== "new" ? { label: item.label, emoji: item.emoji, color: item.color, meta: item.meta ?? {} } : blank);
  }
  const list = acc.byKind(kind);
  const save = async () => {
    if (!f.label.trim()) return toast("error", "Le libellé est obligatoire.");
    const data = { label: f.label.trim(), emoji: f.emoji, color: f.color, meta: f.meta };
    const o =
      item === "new"
        ? await api<Option>(`${acc.base}/e/option`, { method: "POST", json: { ...data, kind, order: Math.max(0, ...list.map((x) => x.order)) + 1 } })
        : await api<Option>(`${acc.base}/e/option/${(item as Option).id}`, { method: "PATCH", json: data });
    await acc.mutate();
    onSaved?.(o);
    onClose();
  };
  const metaToggle = kind === "CARD_STATUS" ? { key: "done", label: "Colonne « terminé » (fin du flux)" } : kind === "RISK_STATUS" ? { key: "closed", label: "Statut « clos »" } : null;
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={`${KIND_LABEL[kind]}${item === "new" ? " : nouvelle valeur" : ""}`}
      footer={
        <>
          {item && item !== "new" && (
            <button
              className="btn btn-danger mr-auto"
              onClick={() =>
                confirm.ask("Supprimer la valeur", `« ${item.label} » sera supprimée (impossible si des éléments l'utilisent encore).`, async () => {
                  await api(`${acc.base}/e/option/${item.id}`, { method: "DELETE" });
                  await acc.mutate();
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
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <Field label="Picto">
            <input className="input text-center" maxLength={8} value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
          </Field>
          <Field label="Libellé">
            <input className="input" autoFocus value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
          </Field>
        </div>
        <div>
          <div className="label">Couleur</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setF({ ...f, color: c })}
                className={`h-7 w-7 rounded-full border-2 transition ${f.color === c ? "scale-110 border-ink" : "border-transparent"}`}
                style={{ background: tone[c] }}
                aria-label={c}
                title={c}
              />
            ))}
          </div>
        </div>
        {metaToggle && <Toggle checked={!!f.meta?.[metaToggle.key]} onChange={(v) => setF({ ...f, meta: { ...f.meta, [metaToggle.key]: v } })} label={metaToggle.label} />}
      </div>
      {confirm.node}
    </Modal>
  );
}

/** Réordonne une liste (sprints, streams, valeurs) en échangeant deux éléments voisins. */
export async function swapOrder(base: string, entity: string, ids: string[], index: number, dir: -1 | 1) {
  const j = index + dir;
  if (j < 0 || j >= ids.length) return;
  const next = [...ids];
  [next[index], next[j]] = [next[j], next[index]];
  await api(`${base}/e/${entity}/reorder`, { method: "POST", json: { ids: next } });
}
