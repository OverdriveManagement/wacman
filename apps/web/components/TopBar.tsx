"use client";

import Link from "next/link";
import { useState } from "react";
import { api, toast } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { Logo, ThemeToggle } from "./Brand";
import { Field, Modal } from "./ui";
import { IconLogout, IconUsers } from "./icons";

export function UserMenu() {
  const { data } = useMe();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  if (!data) return null;
  const initials = data.user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  return (
    <div className="relative">
      <button className="flex h-9 w-9 items-center justify-center rounded-full bg-petrol text-xs font-bold text-white" onClick={() => setOpen(!open)} aria-label="Menu utilisateur">
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fadein absolute right-0 z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-2xl">
            <div className="px-3 py-2">
              <div className="text-sm font-semibold text-ink">{data.user.name}</div>
              <div className="truncate text-xs text-muted">{data.user.email}</div>
              {data.user.isSuperAdmin && <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-wider text-ocre">Super-administrateur</div>}
            </div>
            <div className="my-1 h-px bg-line-soft" />
            {data.user.isSuperAdmin && (
              <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2" onClick={() => setOpen(false)}>
                <IconUsers /> Administration
              </Link>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2"
              onClick={() => {
                setPwd(true);
                setOpen(false);
              }}
            >
              🔑 Changer de mot de passe
            </button>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2" onClick={logout}>
              <IconLogout /> Se déconnecter
            </button>
          </div>
        </>
      )}
      <Modal
        open={pwd}
        onClose={() => setPwd(false)}
        title="Changer de mot de passe"
        footer={
          <>
            <button className="btn" onClick={() => setPwd(false)}>
              Annuler
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await api("/api/auth/password", { method: "POST", json: { current: cur, next } });
                toast("success", "Mot de passe modifié. Reconnectez-vous.");
                window.location.href = "/login";
              }}
            >
              Enregistrer
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Mot de passe actuel">
            <input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="Nouveau mot de passe" hint="10 caractères minimum, avec au moins une lettre et un chiffre.">
            <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-3 px-4">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
