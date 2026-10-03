"use client";

import Link from "next/link";
import { useMe } from "@/lib/hooks";
import { TopBar } from "@/components/TopBar";
import { Empty, Spinner } from "@/components/ui";
import { IconArrowRight, IconPlus } from "@/components/icons";

const ROLE: Record<string, string> = { ADMIN: "Administrateur", EDITOR: "Éditeur", VIEWER: "Lecteur" };

export default function Home() {
  const { data, error } = useMe();
  if (error) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold text-ink">Comptes clients</h1>
            <p className="mt-1 text-sm text-muted">{data ? `Bonjour ${data.user.name.split(" ")[0]}, choisissez un compte.` : " "}</p>
          </div>
          {data?.user.isSuperAdmin && (
            <Link href="/admin?tab=accounts" className="btn btn-primary">
              <IconPlus /> Nouveau compte client
            </Link>
          )}
        </div>
        {!data ? (
          <Spinner />
        ) : data.accounts.length === 0 ? (
          <Empty>Aucun compte client ne vous est ouvert pour l'instant. Demandez un accès à un administrateur.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.accounts.map((a) => (
              <Link key={a.id} href={`/a/${a.slug}`} className={`card group flex flex-col gap-3 p-5 transition hover:border-accent ${a.archived ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-2xl">{a.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-xl font-bold text-ink">{a.name}</div>
                    <div className="text-sm text-muted">{a.clientName}</div>
                  </div>
                  <IconArrowRight className="mt-1 text-muted transition group-hover:translate-x-1 group-hover:text-accent" />
                </div>
                {a.description && <p className="text-sm text-ink-2">{a.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted">{ROLE[a.role]}</span>
                  {a.modules.program && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-2">Program</span>}
                  {a.modules.finance && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-2">Finance</span>}
                  {a.modules.provisioning && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-2">Provisioning</span>}
                  {a.archived && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-amber">Archivé</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
