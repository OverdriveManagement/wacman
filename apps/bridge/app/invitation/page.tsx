"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Logo, ThemeToggle } from "@/components/Brand";
import { Spinner } from "@/components/ui";

type Info = { email: string; name: string; hasPassword: boolean; expiresAt: string; clients: string[] };

/** Création du compte depuis le lien reçu par e-mail : le jeton est dans l'ancre de l'adresse (#…), jamais envoyé aux serveurs web. */
export default function InvitationPage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = window.location.hash.replace(/^#/, "").trim();
    // le jeton ne reste pas dans la barre d'adresse ni dans l'historique
    if (t) history.replaceState(null, "", window.location.pathname);
    setToken(t);
    if (!t) {
      setError("Lien d'invitation incomplet : ouvrez le lien reçu par e-mail.");
      return;
    }
    api<Info>("/api/bridge/auth/invitation/info", { method: "POST", json: { token: t }, silent: true })
      .then((i) => {
        setInfo(i);
        setName(i.name);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (pwd !== pwd2) return setError("Les deux mots de passe ne sont pas identiques.");
    setBusy(true);
    setError("");
    try {
      await api("/api/bridge/auth/invitation/accept", { method: "POST", json: { token, name, password: pwd }, silent: true });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="card w-full max-w-md p-6 md:p-8">
        <div className="mb-6">
          <Logo />
        </div>
        {!info && !error && <Spinner label="Vérification du lien…" />}
        {!info && error && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-ink">Invitation</h1>
            <p className="text-sm text-red">{error}</p>
            <Link href="/login" className="btn w-full">
              Aller à la connexion
            </Link>
          </div>
        )}
        {info && info.hasPassword && (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-ink">Compte déjà actif</h1>
            <p className="text-sm text-ink-2">Votre compte {info.email} existe déjà : connectez-vous avec votre mot de passe habituel.</p>
            <Link href="/login" className="btn btn-primary w-full">
              Se connecter
            </Link>
          </div>
        )}
        {info && !info.hasPassword && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-ink">Bienvenue sur WiBridge</h1>
              <p className="mt-1 text-sm text-ink-2">
                Choisissez votre mot de passe pour activer votre compte{info.clients.length ? ` (${info.clients.join(", ")})` : ""}.
              </p>
            </div>
            <label className="block">
              <span className="label">E-mail</span>
              <input className="input" value={info.email} disabled autoComplete="username" />
            </label>
            <label className="block">
              <span className="label">Nom affiché</span>
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="block">
              <span className="label">Mot de passe</span>
              <input className="input" type="password" required autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
              <span className="mt-1 block text-xs text-muted">10 caractères minimum, avec au moins une lettre et un chiffre.</span>
            </label>
            <label className="block">
              <span className="label">Confirmation du mot de passe</span>
              <input className="input" type="password" required autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
            </label>
            {error && <p className="text-sm text-red">{error}</p>}
            <button className="btn btn-primary w-full" disabled={busy || pwd.length < 10 || !name.trim()}>
              {busy ? "Activation…" : "Activer mon compte"}
            </button>
            <p className="text-xs text-muted">Cet appareil sera reconnu : aucun code ne vous sera demandé ici. Sur un autre appareil, un code vous sera envoyé par e-mail.</p>
          </form>
        )}
      </div>
    </main>
  );
}
