"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/lib/hooks";
import { TopBar } from "@/components/TopBar";
import { Empty, Spinner } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";

export default function Home() {
  const { data, error } = useMe();
  const router = useRouter();
  const open = (data?.clients ?? []).filter((c) => !c.archived);
  // un seul client ouvert : on y va directement
  useEffect(() => {
    if (data && open.length === 1 && !data.user.isSuperAdmin) router.replace(`/c/${open[0].slug}`);
  }, [data, open, router]);
  useEffect(() => {
    if (error) window.location.href = "/login";
  }, [error]);
  if (error) return null;
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold text-ink">Vos espaces d'échange</h1>
          <p className="mt-1 text-sm text-muted">{data ? `Bonjour ${data.user.name.split(" ")[0]}, choisissez un client.` : " "}</p>
        </div>
        {!data ? (
          <Spinner />
        ) : data.clients.length === 0 ? (
          <Empty>Aucun client ne vous est ouvert pour l'instant. Contactez votre interlocuteur Wifirst.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.clients.map((c) => (
              <Link key={c.id} href={`/c/${c.slug}`} className={`card group flex items-center gap-4 p-5 transition hover:border-accent ${c.archived ? "opacity-60" : ""}`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-2xl">{c.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-xl font-bold text-ink">{c.name}</div>
                  <div className="text-sm text-muted">
                    {c.providerName} et {c.clientName}
                    {c.archived ? ", archivé" : ""}
                  </div>
                </div>
                <IconArrowRight className="text-muted transition group-hover:translate-x-1 group-hover:text-accent" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
