"use client";

import useSWR from "swr";
import { useState } from "react";
import { api, fetcher, toast } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import type { Device, Notify } from "@/lib/types";
import { TopBar } from "@/components/TopBar";
import { Field, SectionTitle, Spinner, useConfirm, useSubmit } from "@/components/ui";
import { IconDevice } from "@/components/icons";

const NOTIFY: { id: Notify; label: string; hint: string }[] = [
  { id: "IMMEDIATE", label: "À chaque attribution", hint: "un e-mail dès qu'une question est attribuée à votre organisation" },
  { id: "DAILY", label: "Récapitulatif quotidien", hint: "un e-mail vers 8 h, du lundi au vendredi, s'il y a des questions à traiter" },
  { id: "NONE", label: "Aucun e-mail", hint: "réglage par défaut (les codes de connexion restent envoyés par e-mail)" },
];

export default function AccountPage() {
  const { data: me, mutate } = useMe();
  const { data: devices, mutate: mutateDevices } = useSWR<Device[]>("/api/bridge/auth/devices", fetcher);
  const confirm = useConfirm();
  const [name, setName] = useState<string | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [saveName, savingName] = useSubmit(async () => {
    await api("/api/bridge/auth/me", { method: "PATCH", json: { name } });
    toast("success", "Nom enregistré.");
    setName(null);
    await mutate();
  });
  const [savePwd, savingPwd] = useSubmit(async () => {
    await api("/api/bridge/auth/password", { method: "POST", json: { current: cur, next } });
    setCur("");
    setNext("");
    toast("success", "Mot de passe modifié. Vos autres appareils devront de nouveau recevoir un code.");
    await mutateDevices();
  });
  if (!me) return <Spinner />;
  const members = me.clients.filter((c) => c.member);
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl space-y-5 px-3 py-6 md:px-6">
        <h1 className="font-display text-3xl font-bold text-ink">Mon compte</h1>

        <section className="card space-y-3 p-4">
          <SectionTitle>Profil</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom affiché">
              <input className="input" value={name ?? me.user.name} onChange={(e) => setName(e.target.value)} aria-label="Nom affiché" />
            </Field>
            <Field label="E-mail">
              <input className="input" value={me.user.email} disabled aria-label="E-mail" />
            </Field>
          </div>
          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={savingName || name === null || !name.trim() || name === me.user.name} onClick={() => saveName()}>
              Enregistrer
            </button>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <SectionTitle>Notifications par e-mail</SectionTitle>
          {!members.length ? (
            <p className="text-sm text-muted">{me.user.isSuperAdmin ? "Vous voyez tous les clients sans en être membre : ajoutez-vous un accès dans l'administration pour recevoir des e-mails." : "Aucun client."}</p>
          ) : (
            members.map((c) => (
              <div key={c.id} className="space-y-1.5">
                <div className="text-sm font-semibold text-ink">
                  {c.emoji} {c.name}
                </div>
                <div className="grid gap-1.5" role="radiogroup" aria-label={`Notifications ${c.name}`}>
                  {NOTIFY.map((n) => (
                    <label key={n.id} className="flex cursor-pointer items-start gap-2 text-sm text-ink-2">
                      <input
                        type="radio"
                        name={`notify-${c.id}`}
                        className="mt-1 accent-[var(--accent)]"
                        checked={c.notify === n.id}
                        onChange={async () => {
                          await api(`/api/bridge/c/${c.slug}/notify`, { method: "POST", json: { notify: n.id } });
                          toast("success", "Préférence enregistrée.");
                          await mutate();
                        }}
                      />
                      <span>
                        {n.label}
                        {n.hint && <span className="block text-xs text-muted">{n.hint}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <section className="card space-y-3 p-4">
          <SectionTitle>Mot de passe</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mot de passe actuel">
              <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Mot de passe actuel" />
            </Field>
            <Field label="Nouveau mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre.">
              <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-label="Nouveau mot de passe" />
            </Field>
          </div>
          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={savingPwd || !cur || next.length < 10} onClick={() => savePwd()}>
              Changer le mot de passe
            </button>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <SectionTitle>Appareils de confiance</SectionTitle>
          <p className="-mt-2 text-sm text-muted">Sur ces appareils, aucun code n'est demandé à la connexion. Un appareil inutilisé pendant 180 jours redemande un code.</p>
          {!devices ? (
            <Spinner />
          ) : !devices.length ? (
            <p className="text-sm text-muted">Aucun appareil de confiance.</p>
          ) : (
            <div className="divide-y divide-line-soft rounded-xl border border-line-soft">
              {devices.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <IconDevice className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink-2">
                      {d.label || "Appareil"}
                      {d.current && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[0.65rem] text-accent">cet appareil</span>}
                    </div>
                    <div className="text-xs text-muted" title={dateTime(d.lastUsedAt)}>
                      Ajouté le {dateTime(d.createdAt)}, dernière utilisation {relative(d.lastUsedAt)}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      await api(`/api/bridge/auth/devices/${d.id}`, { method: "DELETE" });
                      await mutateDevices();
                    }}
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
          )}
          {!!devices?.length && (
            <button
              className="btn btn-sm"
              onClick={() =>
                confirm.ask("Retirer tous les appareils", "Un code vous sera demandé à la prochaine connexion sur chacun de vos appareils, y compris celui-ci.", async () => {
                  await api("/api/bridge/auth/devices/revoke-all", { method: "POST", json: {} });
                  await mutateDevices();
                  toast("success", "Appareils retirés.");
                })
              }
            >
              Retirer tous les appareils
            </button>
          )}
        </section>
        {confirm.node}
      </main>
    </>
  );
}
