"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { Logo, ThemeToggle } from "./Brand";
import { Popover } from "./Tag";
import { IconChevronDown, IconLogout, IconSettings, IconUsers } from "./icons";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu() {
  const { data } = useMe();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const logout = async () => {
    await api("/api/bridge/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  return (
    <div className="relative">
      <button className="flex h-9 w-9 items-center justify-center rounded-full bg-petrol text-xs font-bold text-white" onClick={() => setOpen(!open)} aria-label="Menu utilisateur">
        {initials(data.user.name)}
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
            <Link href="/compte" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2" onClick={() => setOpen(false)}>
              <IconSettings /> Mon compte
            </Link>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2" onClick={logout}>
              <IconLogout /> Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Changement de client (affiché seulement si plusieurs clients sont ouverts à l'utilisateur). */
function ClientSwitcher({ current }: { current?: string }) {
  const { data } = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const clients = (data?.clients ?? []).filter((c) => !c.archived || c.slug === current);
  const cur = clients.find((c) => c.slug === current);
  if (clients.length < 2) return null;
  return (
    <>
      <button ref={ref} className="btn btn-ghost btn-sm max-w-[46vw] !px-2" onClick={() => setOpen(true)} aria-label="Changer de client">
        <span className="truncate">{cur ? `${cur.emoji} ${cur.name}` : "Clients"}</span>
        <IconChevronDown width={14} height={14} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={260}>
        <div className="px-2 pb-1 pt-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Clients</div>
        {clients.map((c) => (
          <Link key={c.id} href={`/c/${c.slug}`} onClick={() => setOpen(false)} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2 ${c.slug === current ? "bg-surface-2/70 font-semibold text-ink" : "text-ink-2"}`}>
            <span>{c.emoji}</span>
            <span className="truncate">{c.name}</span>
            {c.archived && <span className="ml-auto text-[0.65rem] text-amber">archivé</span>}
          </Link>
        ))}
      </Popover>
    </>
  );
}

export function TopBar({ client, children }: { client?: string; children?: React.ReactNode }) {
  const { data } = useMe();
  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 md:gap-3 md:px-6">
        <Link href="/" className="shrink-0" aria-label="Accueil WiBridge">
          <span className="sm:hidden">
            <Logo compact />
          </span>
          <span className="hidden sm:inline">
            <Logo />
          </span>
        </Link>
        <ClientSwitcher current={client} />
        <div className="min-w-0 flex-1">{children}</div>
        {data?.user.isSuperAdmin && (
          <Link href="/admin" className="btn btn-ghost btn-sm hidden md:inline-flex" title="Administration de WiBridge">
            <IconUsers /> <span className="hidden lg:inline">Administration</span>
          </Link>
        )}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
