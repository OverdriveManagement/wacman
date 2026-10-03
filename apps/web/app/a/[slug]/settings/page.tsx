"use client";

import useSWR from "swr";
import { useState } from "react";
import { api, download, fetcher, toast } from "@/lib/api";
import { relative } from "@/lib/format";
import type { AccountSettings, Member, MeetingType, OptionKind } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { useMe } from "@/lib/hooks";
import { EntityEditor } from "@/components/EntityEditor";
import { Field, Modal, SectionTitle, Spinner, Toggle, useConfirm } from "@/components/ui";
import { IconDownload, IconPlus, IconTrash } from "@/components/icons";

const TABS = [
  ["general", "Général"],
  ["streams", "Streams"],
  ["sprints", "Sprints"],
  ["lists", "Listes de valeurs"],
  ["meetings", "Types de séance"],
  ["contacts", "Annuaire"],
  ["members", "Accès"],
  ["data", "Données"],
] as const;

export default function SettingsPage() {
  const acc = useAcc();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("general");
  if (!acc.isAdmin) return <p className="text-sm text-muted">Réservé aux administrateurs du compte.</p>;
  return (
    <div className="space-y-5">
      <div className="-mx-3 flex gap-1 overflow-x-auto px-3 md:mx-0 md:flex-wrap md:px-0">
        {TABS.map(([k, l]) => (
          <button key={k} className={`btn btn-sm shrink-0 ${tab === k ? "btn-primary" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "general" && <General />}
      {tab === "streams" && <Streams />}
      {tab === "sprints" && <Sprints />}
      {tab === "lists" && <Lists />}
      {tab === "meetings" && <MeetingTypes />}
      {tab === "contacts" && <Contacts />}
      {tab === "members" && <Members />}
      {tab === "data" && <Data />}
    </div>
  );
}

function General() {
  const acc = useAcc();
  const a = acc.data.account;
  const [form, setForm] = useState({ name: a.name, clientName: a.clientName, clientShortName: a.clientShortName, emoji: a.emoji, description: a.description });
  const [settings, setSettings] = useState<AccountSettings>(a.settings);
  const save = async () => {
    await api(acc.base, { method: "PATCH", json: { ...form, settings } });
    toast("success", "Paramètres enregistrés.");
    acc.mutate();
  };
  const setModule = async (k: "program" | "finance" | "provisioning", v: boolean) => {
    await api(acc.base, { method: "PATCH", json: { modules: { [k]: v } } });
    acc.mutate();
  };
  const text = (k: keyof AccountSettings, label: string, rows = 3) => (
    <Field label={label}>
      <textarea className="input" rows={rows} value={String(settings[k] ?? "")} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
    </Field>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-3 p-5">
        <SectionTitle>Compte client</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
          <Field label="Picto">
            <input className="input text-center" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
          </Field>
          <Field label="Nom du compte">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field label="Client">
            <input className="input" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
          </Field>
          <Field label="Sigle client">
            <input className="input" value={form.clientShortName} onChange={(e) => setForm({ ...form, clientShortName: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="pt-2">
          <div className="label">Sections du compte</div>
          <div className="flex flex-col gap-2">
            <Toggle checked={a.modules.program} onChange={(v) => setModule("program", v)} label="Program Management" />
            <Toggle checked={a.modules.finance} onChange={(v) => setModule("finance", v)} label="Finance management" />
            <Toggle checked={a.modules.provisioning} onChange={(v) => setModule("provisioning", v)} label="Provisioning management" />
          </div>
        </div>
        <div className="grid gap-3 pt-2 sm:grid-cols-2">
          <Field label="Libellé « leader »">
            <input className="input" value={settings.labels.leader} onChange={(e) => setSettings({ ...settings, labels: { ...settings.labels, leader: e.target.value } })} />
          </Field>
          <Field label="Libellé « prescripteur »">
            <input className="input" value={settings.labels.prescriber} onChange={(e) => setSettings({ ...settings, labels: { ...settings.labels, prescriber: e.target.value } })} />
          </Field>
        </div>
      </section>
      <section className="card space-y-3 p-5">
        <SectionTitle>Textes de la section Program Management</SectionTitle>
        <p className="-mt-2 text-xs text-muted">Balisage accepté : **gras**, puces « • », [lien](https://…).</p>
        {text("intro", "Bandeau d'introduction")}
        {text("kanbanGuide", "Mode d'emploi du kanban", 6)}
        {text("governanceIntro", "Introduction de la comitologie")}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Titre comitologie interne">
            <input className="input" value={settings.governanceInternalTitle} onChange={(e) => setSettings({ ...settings, governanceInternalTitle: e.target.value })} />
          </Field>
          <Field label="Titre comitologie conjointe">
            <input className="input" value={settings.governanceJointTitle} onChange={(e) => setSettings({ ...settings, governanceJointTitle: e.target.value })} />
          </Field>
          <Field label="Dernière colonne (interne)">
            <input className="input" value={settings.governanceInternalSupportLabel} onChange={(e) => setSettings({ ...settings, governanceInternalSupportLabel: e.target.value })} />
          </Field>
          <Field label="Dernière colonne (conjointe)">
            <input className="input" value={settings.governanceJointSupportLabel} onChange={(e) => setSettings({ ...settings, governanceJointSupportLabel: e.target.value })} />
          </Field>
        </div>
        {text("sprintMethodology", "Méthodologie des sprints")}
      </section>
      <div className="lg:col-span-2">
        <button className="btn btn-primary" onClick={save}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function Streams() {
  const acc = useAcc();
  const rows = [...acc.data.streams].sort((a, b) => a.order - b.order);
  return (
    <section className="space-y-3">
      <SectionTitle>Streams</SectionTitle>
      <p className="-mt-2 text-sm text-muted">
        « Kanban » affiche le couloir du stream dans le kanban, « Ligne de séance » crée d'office sa ligne dans une nouvelle séance de statut des streams, « Annuaire » l'affiche dans
        Streams et interlocuteurs.
      </p>
      <EntityEditor
        entity="stream"
        rows={rows as never}
        reorder
        onChange={() => acc.mutate()}
        addLabel="Ajouter un stream"
        newRow={() => ({ name: "Nouveau stream", order: rows.length + 1 })}
        deleteText={(r) => `Le stream « ${String(r.name)} » sera supprimé ; ses cartes restent mais sans stream.`}
        columns={[
          { key: "emoji", label: "Picto", type: "emoji", width: "70px" },
          { key: "name", label: "Stream", type: "text" },
          { key: "leader", label: acc.data.account.settings.labels.leader, type: "text" },
          { key: "prescriber", label: acc.data.account.settings.labels.prescriber, type: "text" },
          { key: "active", label: "Actif", type: "toggle" },
          { key: "inKanban", label: "Kanban", type: "toggle" },
          { key: "inStatusTemplate", label: "Ligne de séance", type: "toggle" },
          { key: "inDirectory", label: "Annuaire", type: "toggle" },
        ]}
      />
    </section>
  );
}

function Sprints() {
  const acc = useAcc();
  const rows = [...acc.data.sprints].sort((a, b) => a.order - b.order);
  return (
    <section className="space-y-3">
      <SectionTitle>Sprints</SectionTitle>
      <EntityEditor
        entity="sprint"
        rows={rows as never}
        reorder
        onChange={() => acc.mutate()}
        addLabel="Ajouter un sprint"
        newRow={() => ({ name: `Sprint ${rows.length + 1}`, order: rows.length + 1 })}
        deleteText={(r) => `${String(r.name)} sera supprimé ; ses cartes restent mais sans sprint.`}
        columns={[
          { key: "name", label: "Sprint", type: "text", width: "130px" },
          { key: "startDate", label: "Début", type: "date", width: "150px" },
          { key: "endDate", label: "Fin", type: "date", width: "150px" },
          {
            key: "state",
            label: "État",
            type: "select",
            width: "140px",
            options: [
              { value: "UPCOMING", label: "À venir" },
              { value: "CURRENT", label: "En cours" },
              { value: "DONE", label: "Terminé" },
            ],
          },
          { key: "clientMilestone", label: `Échéance ${acc.data.account.clientName}`, type: "multiline" },
          { key: "objective", label: "Objectif", type: "multiline" },
        ]}
      />
    </section>
  );
}

const KINDS: { kind: OptionKind; label: string; hint: string; meta?: { key: string; label: string } }[] = [
  { kind: "CARD_STATUS", label: "Colonnes du kanban (statuts des cartes)", hint: "« Terminé » marque la colonne de fin : ses cartes ne remontent plus en alerte et ne suivent pas une bascule de sprint.", meta: { key: "done", label: "Terminé" } },
  { kind: "ALERT_LEVEL", label: "Niveaux de vigilance / alerte", hint: "L'ordre compte : le dernier niveau est le plus grave." },
  { kind: "HIGHLIGHT_TYPE", label: "Types de faits marquants", hint: "" },
  { kind: "STREAM_STATUS", label: "Statuts des streams en séance", hint: "" },
  { kind: "TOPIC_THEME", label: "Thématiques des sujets", hint: "" },
  { kind: "TOPIC_NATURE", label: "Natures des sujets", hint: "" },
  { kind: "RISK_TYPE", label: "Types de risques et arbitrages", hint: "" },
  { kind: "RISK_STATUS", label: "Statuts des risques et arbitrages", hint: "« Clos » masque l'élément par défaut.", meta: { key: "closed", label: "Clos" } },
  { kind: "RISK_CRITICALITY", label: "Criticités", hint: "L'ordre sert au tri : la première valeur est la plus critique." },
];

function Lists() {
  const acc = useAcc();
  return (
    <div className="space-y-8">
      {KINDS.map((k) => {
        const rows = acc.byKind(k.kind);
        return (
          <section key={k.kind} className="space-y-2">
            <h3 className="font-display text-base font-bold text-heading">{k.label}</h3>
            {k.hint && <p className="text-xs text-muted">{k.hint}</p>}
            <EntityEditor
              entity="option"
              rows={rows as never}
              reorder
              onChange={() => acc.mutate()}
              addLabel="Ajouter une valeur"
              newRow={() => ({ kind: k.kind, label: "Nouvelle valeur", order: rows.length + 1 })}
              deleteText={(r) => `La valeur « ${String(r.label)} » sera supprimée (impossible si des cartes l'utilisent encore).`}
              columns={[
                { key: "emoji", label: "Picto", type: "emoji", width: "70px" },
                { key: "label", label: "Libellé", type: "text" },
                { key: "color", label: "Couleur", type: "color", width: "170px" },
                ...(k.meta ? [{ key: "meta", label: k.meta.label, type: "meta-toggle" as const, metaKey: k.meta.key, width: "90px" }] : []),
              ]}
            />
          </section>
        );
      })}
    </div>
  );
}

function MeetingTypes() {
  const acc = useAcc();
  const [edit, setEdit] = useState<MeetingType | "new" | null>(null);
  const confirm = useConfirm();
  return (
    <section className="space-y-3">
      <SectionTitle
        actions={
          <button className="btn btn-sm" onClick={() => setEdit("new")}>
            <IconPlus /> Nouveau type de séance
          </button>
        }
      >
        Types de séance
      </SectionTitle>
      <p className="-mt-2 text-sm text-muted">Chaque type de séance assemble un ou plusieurs blocs : faits marquants, statut des streams, sujets (alertes, arbitrages, informations).</p>
      <div className="grid gap-3 md:grid-cols-2">
        {acc.data.meetingTypes.map((m) => (
          <div key={m.id} className="card p-4">
            <div className="flex items-start gap-2">
              <span className="text-2xl">{m.emoji}</span>
              <div className="flex-1">
                <div className="font-semibold text-ink">
                  {m.name} {!m.active && <span className="text-xs text-amber">(masqué)</span>}
                </div>
                <div className="text-xs text-muted">{m.frequency}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-[0.7rem]">
                  {m.blocks.map((b) => (
                    <span key={b} className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">
                      {BLOCKS[b]}
                    </span>
                  ))}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setEdit(m)}>
                Modifier
              </button>
              <button
                className="btn btn-sm btn-ghost btn-danger"
                aria-label="Supprimer"
                onClick={() =>
                  confirm.ask("Supprimer le type de séance", `« ${m.name} » et toutes ses séances seront supprimés définitivement.`, async () => {
                    await api(`${acc.base}/e/meetingType/${m.id}`, { method: "DELETE" });
                    acc.mutate();
                  })
                }
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <MeetingTypeModal item={edit} onClose={() => setEdit(null)} />
      {confirm.node}
    </section>
  );
}

const BLOCKS: Record<string, string> = { HIGHLIGHTS: "Faits marquants", STREAM_STATUS: "Statut des streams", TOPICS: "Sujets" };

function MeetingTypeModal({ item, onClose }: { item: MeetingType | "new" | null; onClose: () => void }) {
  const acc = useAcc();
  const blank = { name: "", emoji: "🗓️", frequency: "", description: "", guide: "", blocks: ["HIGHLIGHTS"] as string[], settings: {} as MeetingType["settings"], active: true };
  const init = item === "new" || !item ? blank : item;
  const [f, setF] = useState(init);
  const [key, setKey] = useState("");
  const k = item === "new" ? "new" : item?.id ?? "";
  if (k !== key) {
    setKey(k);
    setF(init);
  }
  const save = async () => {
    if (!f.name.trim() || !f.blocks.length) return toast("error", "Nom et au moins un bloc requis.");
    const data = { name: f.name, emoji: f.emoji, frequency: f.frequency, description: f.description, guide: f.guide, blocks: f.blocks, settings: f.settings, active: f.active };
    if (item === "new") await api(`${acc.base}/e/meetingType`, { method: "POST", json: { ...data, order: acc.data.meetingTypes.length + 1 } });
    else if (item) await api(`${acc.base}/e/meetingType/${item.id}`, { method: "PATCH", json: data });
    acc.mutate();
    onClose();
  };
  const st = f.settings ?? {};
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      wide
      title={item === "new" ? "Nouveau type de séance" : "Type de séance"}
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
        <div className="grid gap-3 sm:grid-cols-[80px_1fr_1fr]">
          <Field label="Picto">
            <input className="input text-center" value={f.emoji} onChange={(e) => setF({ ...f, emoji: e.target.value })} />
          </Field>
          <Field label="Nom">
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Fréquence">
            <input className="input" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })} />
          </Field>
        </div>
        <div>
          <div className="label">Blocs</div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(BLOCKS).map(([b, l]) => (
              <label key={b} className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={f.blocks.includes(b)} onChange={(e) => setF({ ...f, blocks: e.target.checked ? [...f.blocks, b] : f.blocks.filter((x) => x !== b) })} />
                {l}
              </label>
            ))}
          </div>
        </div>
        {f.blocks.includes("STREAM_STATUS") && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Libellé colonne statut">
              <input className="input" value={st.statusLabel ?? ""} placeholder="Statut" onChange={(e) => setF({ ...f, settings: { ...st, statusLabel: e.target.value } })} />
            </Field>
            <Field label="Libellé colonne avancement">
              <input className="input" value={st.progressLabel ?? ""} placeholder="Avancement" onChange={(e) => setF({ ...f, settings: { ...st, progressLabel: e.target.value } })} />
            </Field>
            <Field label="Libellé colonne alertes">
              <input className="input" value={st.alertsLabel ?? ""} placeholder="Alertes & prérequis" onChange={(e) => setF({ ...f, settings: { ...st, alertsLabel: e.target.value } })} />
            </Field>
          </div>
        )}
        {f.blocks.includes("TOPICS") && (
          <Field label="Libellé colonne arbitrage">
            <input className="input" value={st.decisionLabel ?? ""} placeholder="Arbitrage ou décision demandée" onChange={(e) => setF({ ...f, settings: { ...st, decisionLabel: e.target.value } })} />
          </Field>
        )}
        <Field label="Cadrage (affiché en tête de page)">
          <textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Mode d'emploi">
          <textarea className="input" rows={5} value={f.guide} onChange={(e) => setF({ ...f, guide: e.target.value })} />
        </Field>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Visible dans le menu" />
      </div>
    </Modal>
  );
}

function Contacts() {
  const acc = useAcc();
  return (
    <section className="space-y-3">
      <SectionTitle>Annuaire du compte</SectionTitle>
      <p className="-mt-2 text-sm text-muted">Porteurs de cartes et auteurs de faits marquants. Un contact n'a pas besoin d'un accès à WacMan ; si son e-mail correspond à un utilisateur, il lui est relié.</p>
      <EntityEditor
        entity="contact"
        rows={acc.data.contacts as never}
        onChange={() => acc.mutate()}
        addLabel="Ajouter un contact"
        newRow={() => ({ name: "Nouveau contact" })}
        deleteText={(r) => `« ${String(r.name)} » sera retiré de l'annuaire ; ses cartes restent mais sans porteur.`}
        columns={[
          { key: "name", label: "Nom", type: "text" },
          { key: "email", label: "E-mail", type: "text" },
          { key: "company", label: "Société", type: "text", width: "160px" },
          { key: "role", label: "Rôle", type: "text" },
        ]}
      />
    </section>
  );
}

const ROLES = { ADMIN: "Administrateur", EDITOR: "Éditeur", VIEWER: "Lecteur" } as const;

function Members() {
  const acc = useAcc();
  const { data: me } = useMe();
  const { data, mutate } = useSWR<Member[]>(`${acc.base}/members`, fetcher);
  const [add, setAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "EDITOR", password: "" });
  const confirm = useConfirm();
  return (
    <section className="space-y-3">
      <SectionTitle
        actions={
          <button className="btn btn-sm" onClick={() => setAdd(true)}>
            <IconPlus /> Donner un accès
          </button>
        }
      >
        Accès au compte
      </SectionTitle>
      <p className="-mt-2 text-sm text-muted">Administrateur : configuration et accès. Éditeur : contenu (cartes, séances, risques). Lecteur : consultation et commentaires.</p>
      {!data ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Rôle</th>
                <th>Dernière connexion</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.membershipId}>
                  <td>
                    <div className="font-semibold text-ink">{m.user.name}</div>
                    <div className="text-xs text-muted">
                      {m.user.email}
                      {!m.user.active && " (désactivé)"}
                    </div>
                  </td>
                  <td>
                    <select
                      className="input !w-auto !py-1 text-sm"
                      value={m.role}
                      disabled={m.user.id === me?.user.id && !me?.user.isSuperAdmin}
                      onChange={async (e) => {
                        await api(`${acc.base}/members/${m.membershipId}`, { method: "PATCH", json: { role: e.target.value } });
                        mutate();
                      }}
                    >
                      {Object.entries(ROLES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-sm">{m.user.lastLoginAt ? relative(m.user.lastLoginAt) : "jamais"}</td>
                  <td className="text-right">
                    <button
                      className="btn btn-ghost btn-sm btn-danger"
                      onClick={() =>
                        confirm.ask("Retirer l'accès", `${m.user.name} n'aura plus accès à ce compte client.`, async () => {
                          await api(`${acc.base}/members/${m.membershipId}`, { method: "DELETE" });
                          mutate();
                        })
                      }
                    >
                      Retirer
                    </button>
                  </td>
                </tr>
              ))}
              {!data.length && (
                <tr>
                  <td colSpan={4} className="text-center text-muted">
                    Aucun accès nominatif (les super-administrateurs voient tous les comptes).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={add}
        onClose={() => setAdd(false)}
        title="Donner un accès"
        footer={
          <>
            <button className="btn" onClick={() => setAdd(false)}>
              Annuler
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await api(`${acc.base}/members`, { method: "POST", json: { ...form, password: form.password || undefined } });
                toast("success", "Accès donné.");
                setAdd(false);
                setForm({ email: "", name: "", role: "EDITOR", password: "" });
                mutate();
              }}
            >
              Valider
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="E-mail">
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Nom">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Rôle">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mot de passe initial" hint="Uniquement si l'utilisateur n'existe pas encore : 10 caractères minimum, avec une lettre et un chiffre. Communiquez-le lui par un canal séparé.">
            <input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </div>
      </Modal>
      {confirm.node}
    </section>
  );
}

function Data() {
  const acc = useAcc();
  const { data: me } = useMe();
  return (
    <section className="space-y-4">
      <SectionTitle>Données</SectionTitle>
      <div className="card space-y-3 p-5">
        <div className="font-semibold text-ink">Exports</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => download(`${acc.base}/export/cards.xlsx`)}>
            <IconDownload /> Toutes les cartes (Excel)
          </button>
          {me?.user.isSuperAdmin && (
            <button className="btn" onClick={() => download(`${acc.base}/export/account.json`)}>
              <IconDownload /> Sauvegarde complète du compte (JSON)
            </button>
          )}
        </div>
        <p className="text-xs text-muted">La sauvegarde JSON contient la configuration et toutes les données du compte ; elle se réimporte depuis Administration, rubrique Import.</p>
      </div>
    </section>
  );
}
