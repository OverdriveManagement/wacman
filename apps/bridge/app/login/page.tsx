"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Logo, ThemeToggle } from "@/components/Brand";

type LoginResult = { challengeId?: string; email?: string; devCode?: string; trusted?: boolean };

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"password" | "code" | "forgot" | "reset">("password");
  const [reset, setReset] = useState<{ challengeId: string; devCode?: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [info, setInfo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(true);
  const [challenge, setChallenge] = useState<LoginResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const done = () => {
    const next = params.get("next");
    // seul un chemin interne est accepté (pas « //site.example » ni « /\site.example »)
    router.replace(next && /^\/(?![/\\])/.test(next) ? next : "/");
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<LoginResult>("/api/bridge/auth/login", { method: "POST", json: { email, password }, silent: true });
      if (r.trusted) return done();
      setChallenge(r);
      setCode("");
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge?.challengeId) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/bridge/auth/verify", { method: "POST", json: { challengeId: challenge.challengeId, code, trust }, silent: true });
      done();
    } catch (err) {
      setError((err as Error).message);
      if ((err as Error).message.includes("Recommencez")) {
        setStep("password");
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ challengeId: string; devCode?: string }>("/api/bridge/auth/forgot", { method: "POST", json: { email }, silent: true });
      setReset(r);
      setCode("");
      setNewPassword("");
      setStep("reset");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reset) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/bridge/auth/reset", { method: "POST", json: { challengeId: reset.challengeId, code, password: newPassword }, silent: true });
      setInfo("Mot de passe modifié. Connectez-vous avec le nouveau mot de passe.");
      setPassword("");
      setCode("");
      setStep("password");
    } catch (err) {
      setError((err as Error).message);
      if ((err as Error).message.includes("Refaites")) setStep("forgot");
    } finally {
      setBusy(false);
    }
  };

  const go = (s: typeof step) => {
    setError("");
    setInfo("");
    setStep(s);
  };

  return (
    <div className="card w-full max-w-sm p-6 md:p-8">
      <div className="mb-6">
        <Logo />
      </div>
      {step === "password" ? (
        <form onSubmit={submitPassword} className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-ink">Connexion</h1>
          <label className="block">
            <span className="label">E-mail</span>
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Mot de passe</span>
            <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {info && <p className="text-sm text-teal">{info}</p>}
          {error && <p className="text-sm text-red">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Vérification…" : "Se connecter"}
          </button>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted">Un code vous est envoyé par e-mail à la première connexion depuis un nouvel appareil.</p>
            <button type="button" className="shrink-0 text-xs font-semibold text-accent hover:underline" onClick={() => go("forgot")}>
              Mot de passe oublié ?
            </button>
          </div>
        </form>
      ) : step === "forgot" ? (
        <form onSubmit={submitForgot} className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-ink">Mot de passe oublié</h1>
          <p className="text-sm text-ink-2">Indiquez votre e-mail : si un compte existe, vous recevrez un code pour choisir un nouveau mot de passe.</p>
          <label className="block">
            <span className="label">E-mail</span>
            <input className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="text-sm text-red">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Envoi…" : "Recevoir un code"}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => go("password")}>
            Retour à la connexion
          </button>
        </form>
      ) : step === "reset" ? (
        <form onSubmit={submitReset} className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-ink">Nouveau mot de passe</h1>
          <p className="text-sm text-ink-2">Si un compte existe pour {email}, un code à 6 chiffres vient d'être envoyé. Il est valable 10 minutes.</p>
          {reset?.devCode && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-amber">Mode développement : code {reset.devCode}</p>}
          <label className="block">
            <span className="label">Code reçu par e-mail</span>
            <input
              className="input text-center font-display text-xl tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="block">
            <span className="label">Nouveau mot de passe</span>
            <input className="input" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <span className="mt-1 block text-xs text-muted">10 caractères minimum, avec au moins une lettre et un chiffre.</span>
          </label>
          {error && <p className="text-sm text-red">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || code.length < 6 || newPassword.length < 10}>
            {busy ? "Enregistrement…" : "Changer le mot de passe"}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => go("password")}>
            Retour à la connexion
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-ink">Nouvel appareil</h1>
          <p className="text-sm text-ink-2">Pour sécuriser votre compte, saisissez le code à 6 chiffres envoyé à {challenge?.email}. Il est valable 10 minutes.</p>
          {challenge?.devCode && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-amber">Mode développement : code {challenge.devCode}</p>}
          <input
            className="input text-center font-display text-2xl tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            aria-label="Code reçu par e-mail"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <label className="flex items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            <span>
              Faire confiance à cet appareil
              <span className="block text-xs text-muted">Plus de code à demander ici. À décocher sur un ordinateur partagé.</span>
            </span>
          </label>
          {error && <p className="text-sm text-red">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || code.length < 6}>
            {busy ? "Vérification…" : "Valider"}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => go("password")}>
            Recommencer
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
