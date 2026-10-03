"use client";

import useSWR from "swr";
import { useState } from "react";
import { api, fetcher, toast } from "@/lib/api";
import { relative } from "@/lib/format";
import type { ApiToken } from "@/lib/types";
import { Field, Modal, useConfirm } from "./ui";
import { IconCopy, IconTrash } from "./icons";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Jetons d'accès personnels et branchement de WacMan à Claude (connecteur MCP) ou à un script (API). */
export function TokensDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, mutate } = useSWR<ApiToken[]>(open ? "/api/auth/tokens" : null, fetcher);
  const [name, setName] = useState("Claude");
  const [readOnly, setReadOnly] = useState(false);
  const [days, setDays] = useState("365");
  const [created, setCreated] = useState<(ApiToken & { token: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const base = API_URL || (typeof window !== "undefined" ? window.location.origin : "");

  const create = async () => {
    setBusy(true);
    try {
      const t = await api<ApiToken & { token: string }>("/api/auth/tokens", { method: "POST", json: { name: name.trim(), readOnly, expiresInDays: days ? Number(days) : null } });
      setCreated(t);
      mutate();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("success", `${what} copié.`);
    } catch {
      toast("error", "Copie impossible : sélectionnez le texte à la main.");
    }
  };

  return (
    <Modal open={open} onClose={() => (setCreated(null), onClose())} title="Connecteur Claude et jetons d'accès" wide>
      <div className="space-y-5 text-sm">
        <p className="text-ink-2">
          Un jeton d'accès permet à Claude (claude.ai, Claude Desktop, Claude Code) ou à un script d'utiliser WacMan avec vos droits : consulter les comptes, mettre à jour les cartes, préparer une séance… Chaque modification est tracée dans le journal, marquée « via Claude ». Un jeton en lecture seule ne peut rien modifier.
        </p>

        {created ? (
          <div className="space-y-4 rounded-xl border border-accent/60 bg-accent/5 p-4">
            <div className="font-semibold text-ink">Jeton « {created.name} » créé : copiez-le maintenant, il ne sera plus affiché.</div>
            <CopyLine label="Jeton" value={created.token} onCopy={() => copy(created.token, "Jeton")} />
            <div>
              <div className="label">Dans claude.ai ou Claude Desktop</div>
              <p className="mb-2 text-xs text-muted">Paramètres, Connecteurs, Ajouter un connecteur personnalisé. Nom : WacMan. Adresse du serveur :</p>
              <CopyLine value={`${base}/api/mcp/${created.token}`} onCopy={() => copy(`${base}/api/mcp/${created.token}`, "Adresse du connecteur")} />
              <p className="mt-1 text-xs text-amber">Cette adresse contient le jeton : ne la partagez pas. Révoquez le jeton ici en cas de doute.</p>
            </div>
            <div>
              <div className="label">Dans Claude Code</div>
              <CopyLine
                value={`claude mcp add --transport http wacman ${base}/api/mcp --header "Authorization: Bearer ${created.token}"`}
                onCopy={() => copy(`claude mcp add --transport http wacman ${base}/api/mcp --header "Authorization: Bearer ${created.token}"`, "Commande")}
              />
            </div>
            <div>
              <div className="label">API REST (scripts, intégrations)</div>
              <CopyLine value={`curl -H "Authorization: Bearer ${created.token}" ${base}/api/accounts`} onCopy={() => copy(`curl -H "Authorization: Bearer ${created.token}" ${base}/api/accounts`, "Commande")} />
            </div>
            <button className="btn btn-sm" onClick={() => setCreated(null)}>
              Terminé
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-line-soft p-4">
            <div className="mb-3 font-semibold text-ink">Nouveau jeton</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nom (usage)">
                <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="ex. Claude Desktop" />
              </Field>
              <Field label="Durée de validité">
                <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
                  <option value="30">30 jours</option>
                  <option value="90">90 jours</option>
                  <option value="365">1 an</option>
                  <option value="">Sans limite</option>
                </select>
              </Field>
              <Field label="Droits">
                <label className="flex h-[42px] items-center gap-2 text-ink-2">
                  <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /> Lecture seule
                </label>
              </Field>
            </div>
            <button className="btn btn-primary mt-3" disabled={busy || !name.trim()} onClick={create}>
              Créer le jeton
            </button>
          </div>
        )}

        <div>
          <div className="label">Jetons actifs</div>
          {!data ? (
            <p className="text-muted">Chargement…</p>
          ) : !data.length ? (
            <p className="text-muted">Aucun jeton actif.</p>
          ) : (
            <div className="divide-y divide-line-soft rounded-xl border border-line-soft">
              {data.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink">
                      {t.name} <span className="font-mono text-xs font-normal text-muted">{t.prefix}…</span>
                      {t.readOnly && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[0.68rem] text-muted">lecture seule</span>}
                    </div>
                    <div className="text-xs text-muted">
                      Créé le {new Date(t.createdAt).toLocaleDateString("fr-FR")}
                      {t.lastUsedAt ? `, utilisé ${relative(t.lastUsedAt)}` : ", jamais utilisé"}
                      {t.expiresAt ? `, expire le ${new Date(t.expiresAt).toLocaleDateString("fr-FR")}` : ", sans expiration"}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm btn-danger"
                    aria-label={`Révoquer ${t.name}`}
                    onClick={() =>
                      confirm.ask("Révoquer le jeton", `Le jeton « ${t.name} » cessera immédiatement de fonctionner, y compris dans les connecteurs Claude qui l'utilisent.`, async () => {
                        await api(`/api/auth/tokens/${t.id}`, { method: "DELETE" });
                        toast("success", "Jeton révoqué.");
                        mutate();
                      })
                    }
                  >
                    <IconTrash width={14} height={14} /> Révoquer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {confirm.node}
    </Modal>
  );
}

function CopyLine({ label, value, onCopy }: { label?: string; value: string; onCopy: () => void }) {
  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line-soft bg-surface-2 px-3 py-2 font-mono text-xs text-ink">{value}</code>
        <button className="btn btn-sm shrink-0" onClick={onCopy} aria-label="Copier">
          <IconCopy width={14} height={14} />
        </button>
      </div>
    </div>
  );
}
