"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Logo, ThemeToggle } from "@/components/Brand";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; email: string; devCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ challengeId: string; email: string; devCode?: string }>("/api/auth/login", { method: "POST", json: { email, password }, silent: true });
      setChallenge(r);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/verify", { method: "POST", json: { challengeId: challenge.challengeId, code }, silent: true });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
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
          {error && <p className="text-sm text-red">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Vérification…" : "Continuer"}
          </button>
          <p className="text-xs text-muted">Un code de vérification vous sera envoyé par e-mail.</p>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-ink">Code de vérification</h1>
          <p className="text-sm text-ink-2">Saisissez le code à 6 chiffres envoyé à {challenge?.email}. Il est valable 10 minutes.</p>
          {challenge?.devCode && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-amber">Mode développement : code {challenge.devCode}</p>}
          <input
            className="input text-center font-display text-2xl tracking-[0.5em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {error && <p className="text-sm text-red">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || code.length < 6}>
            {busy ? "Vérification…" : "Se connecter"}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => setStep("password")}>
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
