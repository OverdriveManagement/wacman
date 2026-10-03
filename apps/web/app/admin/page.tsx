"use client";

import useSWR from "swr";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fetcher, toast } from "@/lib/api";
import { relative } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { TopBar } from "@/components/TopBar";
import { Field, Modal, SectionTitle, Spinner, Toggle } from "@/components/ui";
import { IconPlus } from "@/components/icons";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  memberships: { id: string; role: string; account: { name: string; slug: string } }[];
};

function AdminInner() {
  const { data: me } = useMe();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "accounts");
  if (!me) return <Spinner />;
  if (!me.user.isSuperAdmin) return <p className="p-6 text-sm text-muted">Réservé aux super-administrateurs.</p>;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="font-display text-3xl font-bold text-ink">Administration</h1>
      <div className="flex gap-1">
        {[
          ["accounts", "Comptes clients"],
          ["users", "Utilisateurs"],
          ["import", "Import"],
        ].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? "btn-primary" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "accounts" && <Accounts />}
      {tab === "users" && <Users />}
      {tab === "import" && <Import />}
    </main>
  );
}

function Accounts() {
  const { data: me, mutate } = useMe();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", clientName: "", clientShortName: "", emoji: "📁", description: "", duplicateFromAccountId: "" });
  const create = async () => {
    const a = await api<{ slug: string }>("/api/accounts", { method: "POST", json: { ...form, duplicateFromAccountId: form.duplicateFromAccountId || undefined } });
    toast("success", "Compte client créé.");
    await mutate();
    router.push(`/a/${a.slug}/settings`);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <SectionTitle>Comptes existants</SectionTitle>
        <div className="space-y-2">
          {me?.accounts.map((a) => (
            <Link key={a.id} href={`/a/${a.slug}`} className="card flex items-center gap-3 p-3 hover:border-accent">
              <span className="text-2xl">{a.emoji}</span>
              <div className="flex-1">
                <div className="font-semibold text-ink">{a.name}</div>
                <div className="text-xs text-muted">
                  {a.clientName}, /{a.slug}
                </div>
              </div>
              {a.archived && <span className="text-xs text-amber">Archivé</span>}
            </Link>
          ))}
        </div>
      </section>
      <section className="card space-y-3 p-5">
        <SectionTitle>Nouveau compte client</SectionTitle>
        <div className="grid grid-cols-[70px_1fr] gap-3">
          <Field label="Picto">
            <input className="input text-center" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          </Field>
          <Field label="Nom du compte">
            <input className="input" placeholder="ex. SNCF - Wi-Fi gares" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="Client">
            <input className="input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </Field>
          <Field label="Sigle">
            <input className="input" value={form.clientShortName} onChange={(e) => setForm({ ...form, clientShortName: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Configuration de départ" hint="Dupliquer reprend streams, sprints, listes, types de séance et comitologie, sans les données.">
          <select className="input" value={form.duplicateFromAccountId} onChange={(e) => setForm({ ...form, duplicateFromAccountId: e.target.value })}>
            <option value="">Configuration par défaut (à partir de rien)</option>
            {me?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                Dupliquer la configuration de {a.name}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn btn-primary w-full" disabled={!form.name || !form.clientName || !form.clientShortName} onClick={create}>
          <IconPlus /> Créer le compte
        </button>
      </section>
    </div>
  );
}

function Users() {
  const { data, mutate } = useSWR<AdminUser[]>("/api/admin/users", fetcher);
  const [edit, setEdit] = useState<AdminUser | "new" | null>(null);
  return (
    <section className="space-y-3">
      <SectionTitle
        actions={
          <button className="btn btn-sm" onClick={() => setEdit("new")}>
            <IconPlus /> Nouvel utilisateur
          </button>
        }
      >
        Utilisateurs
      </SectionTitle>
      <p className="-mt-2 text-sm text-muted">Les accès aux comptes clients se donnent dans les paramètres de chaque compte, rubrique Accès.</p>
      {!data ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Accès</th>
                <th>Dernière connexion</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td>
                    <div className="font-semibold text-ink">
                      {u.name} {u.isSuperAdmin && <span className="ml-1 text-[0.68rem] font-semibold uppercase text-ocre">super-admin</span>}
                    </div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </td>
                  <td className="text-xs">{u.memberships.map((m) => `${m.account.name} (${m.role})`).join(", ") || "-"}</td>
                  <td className="text-sm">{u.lastLoginAt ? relative(u.lastLoginAt) : "jamais"}</td>
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
      <UserModal item={edit} onClose={() => setEdit(null)} reload={() => mutate()} />
    </section>
  );
}

function UserModal({ item, onClose, reload }: { item: AdminUser | "new" | null; onClose: () => void; reload: () => void }) {
  const isNew = item === "new";
  const [f, setF] = useState({ email: "", name: "", password: "", active: true, isSuperAdmin: false });
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setF(item && item !== "new" ? { email: item.email, name: item.name, password: "", active: item.active, isSuperAdmin: item.isSuperAdmin } : { email: "", name: "", password: "", active: true, isSuperAdmin: false });
  }
  const save = async () => {
    if (isNew) await api("/api/admin/users", { method: "POST", json: { email: f.email, name: f.name, password: f.password, isSuperAdmin: f.isSuperAdmin } });
    else if (item) await api(`/api/admin/users/${item.id}`, { method: "PATCH", json: { name: f.name, active: f.active, isSuperAdmin: f.isSuperAdmin, ...(f.password ? { password: f.password } : {}) } });
    toast("success", "Utilisateur enregistré.");
    reload();
    onClose();
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={isNew ? "Nouvel utilisateur" : "Utilisateur"}
      footer={
        <>
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
        <Field label="E-mail">
          <input className="input" type="email" disabled={!isNew} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Nom">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={isNew ? "Mot de passe initial" : "Nouveau mot de passe (laisser vide pour ne pas changer)"} hint="10 caractères minimum, avec une lettre et un chiffre.">
          <input className="input" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <div className="flex flex-col gap-2">
          {!isNew && <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Compte actif" />}
          <Toggle checked={f.isSuperAdmin} onChange={(v) => setF({ ...f, isSuperAdmin: v })} label="Super-administrateur (tous les comptes clients)" />
        </div>
      </div>
    </Modal>
  );
}

function Import() {
  const { mutate } = useMe();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ slug: string; replaced: boolean; counts: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return toast("error", "Le contenu n'est pas un JSON valide.");
    }
    setBusy(true);
    try {
      const r = await api<{ slug: string; replaced: boolean; counts: Record<string, number> }>("/api/admin/import", { method: "POST", json });
      setResult(r);
      mutate();
      toast("success", r.replaced ? "Compte remplacé par l'import." : "Compte créé par l'import.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3">
      <SectionTitle>Import d'un fichier de compte</SectionTitle>
      <p className="-mt-2 text-sm text-muted">
        Format « wacman-account-v1 » (sauvegarde JSON d'un compte, ou fichier produit depuis le Notion). Si le compte existe déjà (même identifiant), sa configuration et ses données sont remplacées ; les accès sont conservés.
      </p>
      <input
        type="file"
        accept="application/json,.json"
        className="block text-sm text-ink-2"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) setText(await file.text());
        }}
      />
      <textarea className="input font-mono text-xs" rows={10} placeholder="… ou collez le JSON ici" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={run}>
        {busy ? "Import en cours…" : "Importer"}
      </button>
      {result && (
        <div className="card p-4 text-sm">
          <div className="mb-2 font-semibold text-ink">
            Compte /{result.slug} {result.replaced ? "remplacé" : "créé"}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {Object.entries(result.counts).map(([k, v]) => (
              <div key={k} className="flex justify-between text-ink-2">
                <span className="text-muted">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
          <Link href={`/a/${result.slug}`} className="btn btn-sm mt-3">
            Ouvrir le compte
          </Link>
        </div>
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
