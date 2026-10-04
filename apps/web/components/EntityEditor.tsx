"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { COLORS, tone } from "@/lib/format";
import { useAcc } from "./AccountContext";
import { Toggle, useConfirm } from "./ui";
import { IconDown, IconPlus, IconTrash, IconUp } from "./icons";

export type Column = {
  key: string;
  label: string;
  type: "text" | "emoji" | "toggle" | "select" | "date" | "multiline" | "color" | "meta-toggle";
  options?: { value: string; label: string }[];
  width?: string;
  metaKey?: string; // pour meta-toggle
};

/**
 * Éditeur tabulaire générique d'une entité de configuration (streams, sprints, listes, contacts...).
 * Chaque cellule s'enregistre à la sortie du champ.
 */
export function EntityEditor<T extends { id: string } & Record<string, unknown>>({
  entity,
  rows,
  columns,
  newRow,
  reorder = false,
  onChange,
  addLabel = "Ajouter",
  deleteText,
}: {
  entity: string;
  rows: T[];
  columns: Column[];
  newRow?: () => Record<string, unknown>;
  reorder?: boolean;
  onChange: () => void;
  addLabel?: string;
  deleteText?: (r: T) => string;
}) {
  const acc = useAcc();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const save = async (id: string, data: Record<string, unknown>) => {
    await api(`${acc.base}/e/${entity}/${id}`, { method: "PATCH", json: data });
    onChange();
  };
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const ids = rows.map((r) => r.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api(`${acc.base}/e/${entity}/reorder`, { method: "POST", json: { ids } });
    onChange();
  };

  const cell = (r: T, c: Column) => {
    const v = r[c.key];
    switch (c.type) {
      case "toggle":
        return <Toggle checked={!!v} onChange={(x) => save(r.id, { [c.key]: x })} />;
      case "meta-toggle": {
        const meta = (r.meta ?? {}) as Record<string, unknown>;
        return <Toggle checked={!!meta[c.metaKey!]} onChange={(x) => save(r.id, { meta: { ...meta, [c.metaKey!]: x } })} />;
      }
      case "select":
        return (
          <select className="input !py-1 text-sm" value={String(v ?? "")} onChange={(e) => save(r.id, { [c.key]: e.target.value || null })}>
            {c.options!.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "color":
        return (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: tone[String(v)] ?? tone.slate }} />
            <select className="input !py-1 text-sm" value={String(v ?? "slate")} onChange={(e) => save(r.id, { [c.key]: e.target.value })}>
              {COLORS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        );
      case "date":
        return <input type="date" className="input !py-1 text-sm" key={String(v ?? "")} defaultValue={String(v ?? "")} onBlur={(e) => e.target.value !== (v ?? "") && save(r.id, { [c.key]: e.target.value || null })} />;
      case "multiline":
        return <textarea className="input !py-1 text-sm" rows={2} key={String(v ?? "")} defaultValue={String(v ?? "")} onBlur={(e) => e.target.value !== (v ?? "") && save(r.id, { [c.key]: e.target.value })} />;
      case "emoji":
        return <input className="input !w-14 !px-1 !py-1 text-center" maxLength={8} key={String(v ?? "")} defaultValue={String(v ?? "")} onBlur={(e) => e.target.value !== (v ?? "") && save(r.id, { [c.key]: e.target.value })} />;
      default:
        return <input className="input !py-1 text-sm" key={String(v ?? "")} defaultValue={String(v ?? "")} onBlur={(e) => e.target.value !== (v ?? "") && save(r.id, { [c.key]: e.target.value })} />;
    }
  };

  return (
    <div className="space-y-2">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key + c.label} style={c.width ? { width: c.width } : undefined}>
                  {c.label}
                </th>
              ))}
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td key={c.key + c.label}>{cell(r, c)}</td>
                ))}
                <td className="whitespace-nowrap text-right">
                  {reorder && (
                    <>
                      <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Monter" onClick={() => move(i, -1)}>
                        <IconUp width={14} height={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Descendre" onClick={() => move(i, 1)}>
                        <IconDown width={14} height={14} />
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-ghost btn-sm btn-danger !px-1.5"
                    aria-label="Supprimer"
                    onClick={() =>
                      confirm.ask("Supprimer", deleteText ? deleteText(r) : "Cet élément sera supprimé.", async () => {
                        await api(`${acc.base}/e/${entity}/${r.id}`, { method: "DELETE" });
                        onChange();
                      })
                    }
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={columns.length + 1} className="text-center text-muted">
                  Aucun élément.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {newRow && (
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`${acc.base}/e/${entity}`, { method: "POST", json: newRow() });
              onChange();
            } finally {
              setBusy(false);
            }
          }}
        >
          <IconPlus /> {addLabel}
        </button>
      )}
      {confirm.node}
    </div>
  );
}
