"use client";

import type { Access, Notify, Party } from "@/lib/types";
import { TagSelect, type TagOption } from "../Tag";

/** Éditeur des droits d'un utilisateur : par client, organisation de rattachement, droit par défaut et droits par stream. */

export interface AdminStream {
  id: string;
  name: string;
  emoji: string;
  active: boolean;
  order: number;
  questions: number;
}
export interface AdminClient {
  id: string;
  slug: string;
  name: string;
  clientName: string;
  providerName: string;
  shortName: string;
  emoji: string;
  description: string;
  archived: boolean;
  settings: { providerAnswersForClient: boolean; providerEditsAll: boolean; clientCloseScope: "ANY" | "OWN_OR_ASSIGNED"; clientCanReopen: boolean; notifications: boolean };
  streams: AdminStream[];
  members: number;
  questions: number;
  openQuestions: number;
}
export interface Membership {
  clientId: string;
  side: Party;
  defaultAccess: Access;
  streamAccess: Record<string, Access>;
  notify?: Notify;
}

export function accessLabel(a: Access, c: Pick<AdminClient, "clientName" | "providerName">) {
  return { NONE: "Masqué", READ: "Lecture seule", CLIENT: `Éditeur ${c.clientName}`, PROVIDER: `Éditeur ${c.providerName}`, BOTH: "Éditeur des deux" }[a];
}

const COLOR: Record<Access, string> = { NONE: "slate", READ: "teal", CLIENT: "ocre", PROVIDER: "blue", BOTH: "violet" };
export const accessOptions = (c: AdminClient): TagOption[] => (["NONE", "READ", "CLIENT", "PROVIDER", "BOTH"] as Access[]).map((a) => ({ id: a, label: accessLabel(a, c), color: COLOR[a] }));
export const naturalAccess = (side: Party): Access => (side === "PROVIDER" ? "PROVIDER" : "CLIENT");

export function summary(m: Membership, c: AdminClient) {
  const overrides = Object.entries(m.streamAccess).filter(([sid]) => c.streams.some((s) => s.id === sid));
  const base = accessLabel(m.defaultAccess, c);
  return overrides.length ? `${base}, ${overrides.length} stream${overrides.length > 1 ? "s" : ""} à part` : base;
}

export function RightsEditor({ clients, value, onChange }: { clients: AdminClient[]; value: Membership[]; onChange: (v: Membership[]) => void }) {
  const set = (clientId: string, patch: Partial<Membership> | null) => {
    if (patch === null) return onChange(value.filter((m) => m.clientId !== clientId));
    onChange(value.map((m) => (m.clientId === clientId ? { ...m, ...patch } : m)));
  };
  return (
    <div className="space-y-3">
      {clients.map((c) => {
        const m = value.find((x) => x.clientId === c.id);
        // client archivé : proposé seulement si l'utilisateur y a déjà accès
        if (!m && c.archived) return null;
        if (!m)
          return (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3 py-2.5">
              <span className="text-sm text-muted">
                {c.emoji} {c.name} : pas d'accès
              </span>
              <button type="button" className="btn btn-sm" onClick={() => onChange([...value, { clientId: c.id, side: "CLIENT", defaultAccess: "CLIENT", streamAccess: {} }])}>
                Ouvrir l'accès
              </button>
            </div>
          );
        const opts = accessOptions(c);
        return (
          <div key={c.id} className="rounded-xl border border-line-soft bg-surface-2/40 p-3" data-membership={c.slug}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">
                {c.emoji} {c.name}
              </span>
              <button type="button" className="text-xs text-muted hover:text-red" onClick={() => set(c.id, null)}>
                Retirer l'accès
              </button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">Organisation</span>
              <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Organisation">
                {(["PROVIDER", "CLIENT"] as Party[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={m.side === p}
                    className={`rounded-md px-2.5 py-1 font-semibold ${m.side === p ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`}
                    onClick={() =>
                      // le droit par défaut suit l'organisation s'il correspondait à l'ancienne
                      set(c.id, { side: p, ...(m.defaultAccess === naturalAccess(m.side) ? { defaultAccess: naturalAccess(p) } : {}) })
                    }
                  >
                    {p === "PROVIDER" ? c.providerName : c.clientName}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-line-soft rounded-lg border border-line-soft bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm font-semibold text-ink-2">Tous les streams (par défaut)</span>
                <TagSelect label="Droit par défaut" allowClear={false} options={opts} value={m.defaultAccess} onChange={(v) => v && set(c.id, { defaultAccess: v as Access })} />
              </div>
              {c.streams.map((s) => {
                const own = m.streamAccess[s.id];
                const eff = own ?? m.defaultAccess;
                return (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5" data-stream-right={s.name}>
                    <span className={`text-sm ${s.active ? "text-ink-2" : "text-muted"}`}>
                      {s.emoji} {s.name}
                      {!s.active && " (inactif)"}
                    </span>
                    <span className="flex items-center gap-2">
                      {!own && <span className="text-[0.65rem] text-muted">par défaut</span>}
                      <TagSelect
                        label={`Droit sur ${s.name}`}
                        allowClear={false}
                        options={opts}
                        value={eff}
                        onChange={(v) => {
                          if (!v) return;
                          const next = { ...m.streamAccess };
                          if (v === m.defaultAccess) delete next[s.id];
                          else next[s.id] = v as Access;
                          set(c.id, { streamAccess: next });
                        }}
                      />
                      {own && (
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-accent"
                          title="Revenir au droit par défaut"
                          onClick={() => {
                            const next = { ...m.streamAccess };
                            delete next[s.id];
                            set(c.id, { streamAccess: next });
                          }}
                        >
                          Par défaut
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
