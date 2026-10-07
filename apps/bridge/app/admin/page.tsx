"use client";

import useSWR from "swr";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fetcher, toast } from "@/lib/api";
import { dateTime, frDate, relative } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { BridgeEvent } from "@/lib/types";
import { TopBar } from "@/components/TopBar";
import { Empty, Field, InlineText, Modal, SectionTitle, Spinner, Toggle, useConfirm, useSubmit } from "@/components/ui";
import { RichField } from "@/components/RichText";
import { IconDown, IconPlus, IconSearch, IconTrash, IconUp } from "@/components/icons";
import { RightsEditor, naturalAccess, summary, type AdminClient, type Membership } from "@/components/admin/Rights";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  isSuperAdmin: boolean;
  wacmanAccess: boolean;
  bridgeAccess: boolean;
  passwordSet: boolean;
  lastLoginAt: string | null;
  invitation: { createdAt: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null } | null;
  devices: number;
  memberships: (Membership & { clientName: string; clientSlug: string; notify: string })[];
};

type InviteResult = { userId: string; mode: "invite" | "access"; sent: boolean; error?: string; devLink?: string };

function AdminInner() {
  const { data: me } = useMe();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(params.get("tab") ?? "clients");
  if (!me) return <Spinner />;
  if (!me.user.isSuperAdmin) return <p className="p-6 text-sm text-muted">Réservé au super-administrateur.</p>;
  const go = (t: string) => {
    setTab(t);
    router.replace(`/admin?tab=${t}`, { scroll: false });
  };
  return (
    <main className="mx-auto max-w-6xl space-y-5 px-3 py-6 md:px-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Administration de WiBridge</h1>
        <p className="mt-1 text-sm text-muted">Clients et streams, règles, utilisateurs et droits. Les comptes WiBridge sont distincts de ceux de WacMan, sauf le vôtre.</p>
      </div>
      <div className="flex flex-wrap gap-1" role="tablist">
        {[
          ["clients", "Clients et streams"],
          ["users", "Utilisateurs et droits"],
          ["journal", "Journal"],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`btn btn-sm ${tab === k ? "btn-primary" : ""}`} onClick={() => go(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "clients" && <Clients initial={params.get("client")} />}
      {tab === "users" && <Users />}
      {tab === "journal" && <Journal />}
    </main>
  );
}

function useAdminClients() {
  return useSWR<AdminClient[]>("/api/bridge/admin/clients", fetcher);
}

// ---------------------------------------------------------------------------
// Clients, streams et règles
// ---------------------------------------------------------------------------

function Clients({ initial }: { initial: string | null }) {
  const { data, mutate } = useAdminClients();
  const { mutate: mutateMe } = useMe();
  const [sel, setSel] = useState<string | null>(initial);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (data && !sel && data[0]) setSel(data[0].id);
  }, [data, sel]);
  if (!data) return <Spinner />;
  const c = data.find((x) => x.id === sel) ?? null;
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <section className="space-y-2">
        <button className="btn btn-primary w-full" onClick={() => setCreating(true)}>
          <IconPlus /> Nouveau client
        </button>
        {data.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={`card flex w-full items-center gap-3 p-3 text-left transition hover:border-accent ${sel === x.id ? "!border-accent" : ""} ${x.archived ? "opacity-60" : ""}`}>
            <span className="text-2xl">{x.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink">{x.name}</span>
              <span className="block text-xs text-muted">
                {x.questions} question{x.questions > 1 ? "s" : ""} dont {x.openQuestions} ouverte{x.openQuestions > 1 ? "s" : ""}, {x.members} membre{x.members > 1 ? "s" : ""}
                {x.archived ? ", archivé" : ""}
              </span>
            </span>
          </button>
        ))}
      </section>
      {c ? (
        <ClientEditor key={c.id} c={c} reload={async () => (await mutate(), await mutateMe())} />
      ) : (
        <Empty>Choisissez un client.</Empty>
      )}
      <NewClientModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (id) => {
          await mutate();
          await mutateMe();
          setSel(id);
        }}
      />
    </div>
  );
}

function NewClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: "", clientName: "", providerName: "Wifirst", shortName: "", emoji: "🤝", streams: "" });
  const [save, busy] = useSubmit(async () => {
    const c = await api<{ id: string }>("/api/bridge/admin/clients", {
      method: "POST",
      json: { ...f, streams: f.streams.split("\n").map((s) => s.trim()).filter(Boolean) },
    });
    toast("success", "Client créé.");
    setF({ name: "", clientName: "", providerName: "Wifirst", shortName: "", emoji: "🤝", streams: "" });
    onClose();
    onCreated(c.id);
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouveau client"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" disabled={busy || !f.name.trim() || !f.clientName.trim()} onClick={() => save()}>
            Créer le client
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[70px_1fr] gap-3">
          <Field label="Picto">
            <input className="input text-center" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
          </Field>
          <Field label="Nom de l'espace">
            <input className="input" placeholder="ex. SNCF" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, clientName: f.clientName || e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
          <Field label="Organisation cliente">
            <input className="input" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} />
          </Field>
          <Field label="Organisation Wifirst">
            <input className="input" value={f.providerName} onChange={(e) => setF({ ...f, providerName: e.target.value })} />
          </Field>
          <Field label="Sigle">
            <input className="input" value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} />
          </Field>
        </div>
        <Field label="Streams (un par ligne)" hint="Modifiables ensuite, comme le mode d'emploi et les règles.">
          <textarea className="input" rows={5} value={f.streams} onChange={(e) => setF({ ...f, streams: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function ClientEditor({ c, reload }: { c: AdminClient; reload: () => Promise<unknown> }) {
  const [f, setF] = useState({ name: c.name, clientName: c.clientName, providerName: c.providerName, shortName: c.shortName, emoji: c.emoji, description: c.description });
  const dirty = f.name !== c.name || f.clientName !== c.clientName || f.providerName !== c.providerName || f.shortName !== c.shortName || f.emoji !== c.emoji || f.description !== c.description;
  const patch = async (json: Record<string, unknown>, msg = "Enregistré.") => {
    await api(`/api/bridge/admin/clients/${c.id}`, { method: "PATCH", json });
    toast("success", msg);
    await reload();
  };
  const [saveGeneral, savingGeneral] = useSubmit(() => patch(f, "Client enregistré."));
  const s = c.settings;
  return (
    <section className="space-y-5">
      <div className="card space-y-3 p-4">
        <SectionTitle
          actions={
            <Link href={`/c/${c.slug}`} className="btn btn-sm">
              Ouvrir les questions
            </Link>
          }
        >
          {c.emoji} {c.name}
        </SectionTitle>
        <div className="grid grid-cols-[70px_1fr] gap-3">
          <Field label="Picto">
            <input className="input text-center" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
          </Field>
          <Field label="Nom de l'espace">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
          <Field label="Organisation cliente" hint="Libellé affiché partout (« Attribuée à … », « Éditeur … »).">
            <input className="input" value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} />
          </Field>
          <Field label="Organisation Wifirst">
            <input className="input" value={f.providerName} onChange={(e) => setF({ ...f, providerName: e.target.value })} />
          </Field>
          <Field label="Sigle">
            <input className="input" value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} />
          </Field>
        </div>
        <Field label="Mode d'emploi (affiché en tête des questions)">
          <RichField rows={5} value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Toggle checked={c.archived} onChange={(v) => patch({ archived: v }, v ? "Client archivé : il n'est plus ouvert aux membres." : "Client réactivé.")} label="Archivé (plus d'accès pour les membres)" />
          <button className="btn btn-primary" disabled={!dirty || savingGeneral} onClick={() => saveGeneral()}>
            Enregistrer
          </button>
        </div>
      </div>

      <StreamsEditor c={c} reload={reload} />

      <div className="card space-y-3 p-4">
        <SectionTitle>Règles</SectionTitle>
        <p className="-mt-2 text-sm text-muted">Valeurs par défaut : celles du cadrage. Les droits de chaque personne se règlent par stream dans Utilisateurs et droits.</p>
        <div className="flex flex-col gap-3">
          <Toggle checked={s.providerAnswersForClient} onChange={(v) => patch({ settings: { providerAnswersForClient: v } })} label={`${c.providerName} peut répondre aux questions attribuées à ${c.clientName} (et les compléter à sa place)`} />
          <Toggle checked={s.providerEditsAll} onChange={(v) => patch({ settings: { providerEditsAll: v } })} label={`${c.providerName} peut tout modifier : sujet, texte, streams, échéance, attribution et messages des autres`} />
          <Toggle checked={s.clientCanReopen} onChange={(v) => patch({ settings: { clientCanReopen: v } })} label={`${c.clientName} peut rouvrir une question clôturée`} />
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            <span>{c.clientName} peut clôturer</span>
            <div className="inline-flex rounded-lg border border-line p-0.5 text-xs" role="radiogroup" aria-label="Clôture par le client">
              {(
                [
                  ["ANY", "toutes les questions"],
                  ["OWN_OR_ASSIGNED", "celles qu'il a posées ou qui lui sont attribuées"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} role="radio" aria-checked={s.clientCloseScope === k} className={`rounded-md px-2.5 py-1 font-semibold ${s.clientCloseScope === k ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"}`} onClick={() => patch({ settings: { clientCloseScope: k } })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={s.notifications} onChange={(v) => patch({ settings: { notifications: v } })} label="E-mails de notification (attribution et récapitulatif quotidien), selon la préférence de chacun" />
        </div>
      </div>
    </section>
  );
}

function StreamsEditor({ c, reload }: { c: AdminClient; reload: () => Promise<unknown> }) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [add, adding] = useSubmit(async () => {
    if (!name.trim()) return;
    await api(`/api/bridge/admin/clients/${c.id}/streams`, { method: "POST", json: { name: name.trim(), emoji } });
    setName("");
    setEmoji("");
    await reload();
  });
  const upd = async (id: string, json: Record<string, unknown>) => {
    await api(`/api/bridge/admin/streams/${id}`, { method: "PATCH", json });
    await reload();
  };
  const move = async (i: number, d: -1 | 1) => {
    const ids = c.streams.map((s) => s.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api(`/api/bridge/admin/clients/${c.id}/streams/reorder`, { method: "POST", json: { ids } });
    await reload();
  };
  return (
    <div className="card space-y-3 p-4">
      <SectionTitle>Streams</SectionTitle>
      <p className="-mt-2 text-sm text-muted">Une question relève d'un ou plusieurs streams. Un stream utilisé ne se supprime pas : il se désactive (il reste visible sur ses questions).</p>
      <div className="divide-y divide-line-soft rounded-xl border border-line-soft">
        {c.streams.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-admin-stream={s.name}>
            <input key={s.emoji} className="input !w-12 !px-1 !py-1 text-center" defaultValue={s.emoji} aria-label={`Picto de ${s.name}`} onBlur={(e) => e.target.value !== s.emoji && upd(s.id, { emoji: e.target.value })} />
            <div className="min-w-[160px] flex-1">
              <InlineText value={s.name} onSave={(v) => (v.trim() && v.trim() !== s.name ? upd(s.id, { name: v.trim() }) : undefined)} render={(v) => <span className={`text-sm font-semibold ${s.active ? "text-ink" : "text-muted line-through"}`}>{v}</span>} />
            </div>
            <span className="text-xs text-muted">
              {s.questions} question{s.questions > 1 ? "s" : ""}
            </span>
            <Toggle checked={s.active} onChange={(v) => upd(s.id, { active: v })} label="Actif" />
            <button className="btn btn-ghost btn-sm !px-1.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Monter ${s.name}`}>
              <IconUp width={15} height={15} />
            </button>
            <button className="btn btn-ghost btn-sm !px-1.5" onClick={() => move(i, 1)} disabled={i === c.streams.length - 1} aria-label={`Descendre ${s.name}`}>
              <IconDown width={15} height={15} />
            </button>
            <button
              className="btn btn-ghost btn-sm !px-1.5 text-muted hover:text-red disabled:opacity-30"
              disabled={s.questions > 0}
              title={s.questions > 0 ? "Utilisé par des questions : désactivez-le plutôt" : "Supprimer le stream"}
              aria-label={`Supprimer ${s.name}`}
              onClick={() =>
                confirm.ask("Supprimer le stream", `Le stream « ${s.name} » sera supprimé.`, async () => {
                  await api(`/api/bridge/admin/streams/${s.id}`, { method: "DELETE" });
                  await reload();
                })
              }
            >
              <IconTrash width={15} height={15} />
            </button>
          </div>
        ))}
        {!c.streams.length && <p className="px-3 py-2 text-sm text-muted">Aucun stream.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input !w-14 text-center" placeholder="🧩" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Picto du nouveau stream" />
        <input className="input min-w-[200px] flex-1" placeholder="Nouveau stream" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Nom du nouveau stream" />
        <button className="btn" disabled={adding || !name.trim()} onClick={() => add()}>
          <IconPlus /> Ajouter
        </button>
      </div>
      {confirm.node}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utilisateurs et droits
// ---------------------------------------------------------------------------

function inviteState(u: AdminUser) {
  if (u.passwordSet) return u.lastLoginAt ? `Actif, connecté ${relative(u.lastLoginAt)}` : "Actif, jamais connecté à WiBridge";
  if (!u.invitation) return "Invitation à envoyer";
  if (u.invitation.revokedAt) return "Invitation annulée";
  if (new Date(u.invitation.expiresAt) < new Date()) return `Invitation expirée le ${frDate(u.invitation.expiresAt.slice(0, 10))}`;
  return `Invitation envoyée le ${frDate(u.invitation.createdAt.slice(0, 10))}`;
}

function Users() {
  const { data, mutate } = useSWR<AdminUser[]>("/api/bridge/admin/users", fetcher);
  const { data: clients } = useAdminClients();
  const [edit, setEdit] = useState<AdminUser | "new" | null>(null);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((u) => !t || `${u.name} ${u.email}`.toLowerCase().includes(t));
  }, [data, q]);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:w-72">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" width={16} height={16} />
          <input className="input !pl-8" placeholder="Rechercher un utilisateur" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un utilisateur" />
        </div>
        <button className="btn btn-primary" onClick={() => setEdit("new")}>
          <IconPlus /> Inviter un utilisateur
        </button>
      </div>
      {!data || !clients ? (
        <Spinner />
      ) : !list.length ? (
        <Empty>Aucun utilisateur.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data" aria-label="Utilisateurs">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Accès et droits</th>
                <th>État</th>
                <th>Applications</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={u.bridgeAccess && u.active ? "" : "opacity-55"} data-user-email={u.email}>
                  <td>
                    <div className="font-semibold text-ink">
                      {u.name}
                      {u.isSuperAdmin && <span className="ml-1.5 text-[0.65rem] font-semibold uppercase text-ocre">super-admin</span>}
                    </div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </td>
                  <td className="text-xs">
                    {u.memberships.length
                      ? u.memberships.map((m) => {
                          const c = clients.find((x) => x.id === m.clientId);
                          return (
                            <div key={m.clientId}>
                              <span className="font-semibold text-ink-2">{m.clientName}</span> : {c ? `${m.side === "PROVIDER" ? c.providerName : c.clientName}, ${summary(m, c)}` : ""}
                            </div>
                          );
                        })
                      : u.isSuperAdmin
                        ? "Tous les clients (super-administrateur)"
                        : "Aucun client"}
                  </td>
                  <td className="text-xs">
                    {inviteState(u)}
                    {u.devices > 0 && <div className="text-muted">{u.devices} appareil{u.devices > 1 ? "s" : ""} de confiance</div>}
                  </td>
                  <td className="text-xs">
                    <div className="flex flex-wrap gap-1">
                      {u.bridgeAccess && <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-accent">WiBridge</span>}
                      {u.wacmanAccess && <span className="rounded-full bg-surface-3 px-2 py-0.5 font-semibold text-ink-2">WacMan</span>}
                      {!u.active && <span className="rounded-full bg-red/15 px-2 py-0.5 font-semibold text-red">Désactivé</span>}
                    </div>
                  </td>
                  <td className="text-right">
                    <button className="btn btn-sm" onClick={() => setEdit(u)}>
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {clients && <UserModal item={edit} clients={clients} onClose={() => setEdit(null)} reload={() => mutate()} />}
    </section>
  );
}

function UserModal({ item, clients, onClose, reload }: { item: AdminUser | "new" | null; clients: AdminClient[]; onClose: () => void; reload: () => void }) {
  const isNew = item === "new";
  const confirm = useConfirm();
  const defaultMemberships = (): Membership[] => (clients.length === 1 ? [{ clientId: clients[0].id, side: "CLIENT", defaultAccess: naturalAccess("CLIENT"), streamAccess: {} }] : []);
  const [f, setF] = useState({ email: "", name: "", bridgeAccess: true, wacmanAccess: false });
  const [ms, setMs] = useState<Membership[]>([]);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : (item?.id ?? "");
  if (k !== key) {
    setKey(k);
    setResult(null);
    if (item && item !== "new") {
      setF({ email: item.email, name: item.name, bridgeAccess: item.bridgeAccess, wacmanAccess: item.wacmanAccess });
      setMs(item.memberships.map((m) => ({ clientId: m.clientId, side: m.side, defaultAccess: m.defaultAccess, streamAccess: m.streamAccess })));
    } else {
      setF({ email: "", name: "", bridgeAccess: true, wacmanAccess: false });
      setMs(defaultMemberships());
    }
  }
  const [save, busy] = useSubmit(async () => {
    if (isNew) {
      const r = await api<InviteResult>("/api/bridge/admin/users", { method: "POST", json: { email: f.email, name: f.name, memberships: ms, wacmanAccess: f.wacmanAccess } });
      setResult(r);
      toast(r.sent ? "success" : "error", r.sent ? (r.mode === "invite" ? "Invitation envoyée." : "Compte existant : accès ouvert et e-mail envoyé.") : (r.error ?? "E-mail non envoyé."));
      reload();
      if (r.sent && !r.devLink) onClose();
      return;
    }
    if (!item) return;
    await api(`/api/bridge/admin/users/${item.id}`, { method: "PATCH", json: { name: f.name, ...(item.isSuperAdmin ? {} : { bridgeAccess: f.bridgeAccess, wacmanAccess: f.wacmanAccess }) } });
    await api(`/api/bridge/admin/users/${item.id}/memberships`, { method: "PUT", json: { memberships: ms } });
    toast("success", "Utilisateur enregistré.");
    reload();
    onClose();
  });
  const resend = async () => {
    if (!item || item === "new") return;
    const r = await api<InviteResult>(`/api/bridge/admin/users/${item.id}/invite`, { method: "POST", json: {} });
    setResult(r);
    toast(r.sent ? "success" : "error", r.sent ? "E-mail renvoyé." : (r.error ?? "E-mail non envoyé."));
    reload();
  };
  const u = item && item !== "new" ? item : null;
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      wide
      title={isNew ? "Inviter un utilisateur" : (u?.name ?? "")}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {result ? "Fermer" : "Annuler"}
          </button>
          {!(isNew && result) && (
            <button className="btn btn-primary" disabled={busy || !f.name.trim() || (isNew && !f.email.includes("@"))} onClick={() => save()}>
              {isNew ? "Inviter" : "Enregistrer"}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {result && (
          <div className={`rounded-xl border px-3 py-2 text-sm ${result.sent ? "border-teal/50 text-ink-2" : "border-red/50 text-red"}`}>
            {result.sent ? (result.mode === "invite" ? "Invitation envoyée par e-mail : le lien est valable 7 jours." : "Compte existant : l'accès est ouvert, la personne se connecte avec son mot de passe actuel.") : result.error}
            {result.devLink && (
              <div className="mt-1 break-all text-xs text-amber">
                Mode développement, lien : <a href={result.devLink}>{result.devLink}</a>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="E-mail">
            <input className="input" type="email" disabled={!isNew} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="E-mail" />
          </Field>
          <Field label="Nom">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Nom" />
          </Field>
        </div>
        {isNew && <p className="-mt-2 text-xs text-muted">La personne reçoit un e-mail pour créer son mot de passe. Si l'adresse a déjà un compte (WacMan), l'accès à WiBridge lui est simplement ouvert.</p>}
        <div className="flex flex-col gap-2">
          {!isNew && <Toggle checked={f.bridgeAccess} disabled={u?.isSuperAdmin} onChange={(v) => setF({ ...f, bridgeAccess: v })} label="Accès à WiBridge" />}
          <Toggle checked={f.wacmanAccess} disabled={u?.isSuperAdmin} onChange={(v) => setF({ ...f, wacmanAccess: v })} label="Accès à WacMan (les comptes clients s'ouvrent ensuite dans WacMan, rubrique Accès)" />
        </div>
        <div>
          <SectionTitle>Clients et droits par stream</SectionTitle>
          <RightsEditor clients={clients} value={ms} onChange={setMs} />
        </div>
        {u && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3 text-sm">
            <span className="text-muted">{inviteState(u)}.</span>
            <button className="btn btn-sm" onClick={resend}>
              {u.passwordSet ? "Renvoyer l'e-mail d'accès" : "Renvoyer l'invitation"}
            </button>
            {u.devices > 0 && (
              <button
                className="btn btn-sm"
                onClick={() =>
                  confirm.ask("Appareils de confiance", `Les ${u.devices} appareil(s) de ${u.name} redemanderont un code à la prochaine connexion.`, async () => {
                    await api(`/api/bridge/admin/users/${u.id}/revoke-devices`, { method: "POST", json: {} });
                    toast("success", "Appareils retirés.");
                    reload();
                  })
                }
              >
                Retirer ses appareils de confiance ({u.devices})
              </button>
            )}
          </div>
        )}
      </div>
      {confirm.node}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

function Journal() {
  const { data: clients } = useAdminClients();
  const [clientId, setClientId] = useState("");
  const { data } = useSWR<(BridgeEvent & { ref: number | null; subject: string | null; clientName: string; clientSlug: string })[]>(`/api/bridge/admin/journal?limit=300${clientId ? `&clientId=${clientId}` : ""}`, fetcher);
  return (
    <section className="space-y-3">
      <select className="input !w-auto" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
        <option value="">Tous les clients</option>
        {(clients ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji} {c.name}
          </option>
        ))}
      </select>
      {!data ? (
        <Spinner />
      ) : !data.length ? (
        <Empty>Aucune modification pour l'instant.</Empty>
      ) : (
        <ol className="space-y-2">
          {data.map((e) => (
            <li key={e.id} className="card px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span>{dateTime(e.createdAt)}</span>
                <span className="font-semibold text-ink-2">{e.userName}</span>
                <span>{e.clientName}</span>
                {e.ref && (
                  <Link className="font-semibold text-accent hover:underline" href={`/c/${e.clientSlug}?q=${e.ref}`}>
                    n°{e.ref}
                    {e.subject ? `, ${e.subject.slice(0, 60)}` : ""}
                  </Link>
                )}
              </div>
              <div className="text-sm text-ink-2">{e.summary}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function AdminPage() {
  return (
    <>
      <TopBar />
      <Suspense>
        <AdminInner />
      </Suspense>
    </>
  );
}
