"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAccount } from "@/lib/hooks";
import { AccountContext } from "@/components/AccountContext";
import { Logo, ThemeToggle } from "@/components/Brand";
import { UserMenu } from "@/components/TopBar";
import { Spinner } from "@/components/ui";
import { ExportDialog } from "@/components/ExportDialog";
import { Assistant } from "@/components/Assistant";
import {
  IconBuilding,
  IconDownload,
  IconEuro,
  IconHistory,
  IconHome,
  IconKanban,
  IconMenu,
  IconServer,
  IconSettings,
  IconShield,
  IconSparkles,
  IconX,
} from "@/components/icons";

type NavItem = { href: string; label: string; icon: ReactNode; exact?: boolean };

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const acc = useAccount(slug);
  const [drawer, setDrawer] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  if (acc.error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red">{(acc.error as Error).message || "Compte inaccessible."}</p>
        <Link href="/" className="btn mt-4">
          Retour aux comptes
        </Link>
      </div>
    );
  }
  if (!acc.data) return <Spinner />;
  const { account } = acc.data;
  const base = `/a/${slug}`;

  const program: NavItem[] = account.modules.program
    ? [
        { href: base, label: "Kanban", icon: <IconKanban />, exact: true },
        ...acc.data.meetingTypes
          .filter((m) => m.active)
          .map((m) => ({ href: `${base}/meetings/${m.id}`, label: m.name, icon: <span className="w-[18px] text-center">{m.emoji || "🗓️"}</span> })),
        { href: `${base}/risks`, label: "Risques & arbitrages", icon: <IconShield /> },
        { href: `${base}/governance`, label: "Gouvernance", icon: <IconBuilding /> },
        { href: `${base}/journal`, label: "Journal", icon: <IconHistory /> },
      ]
    : [];
  const other: NavItem[] = [
    ...(account.modules.finance ? [{ href: `${base}/finance`, label: "Finance management", icon: <IconEuro /> }] : []),
    ...(account.modules.provisioning ? [{ href: `${base}/provisioning`, label: "Provisioning management", icon: <IconServer /> }] : []),
    ...(acc.isAdmin ? [{ href: `${base}/settings`, label: "Paramètres du compte", icon: <IconSettings /> }] : []),
  ];
  const active = (i: NavItem) => (i.exact ? pathname === i.href : pathname.startsWith(i.href));

  const nav = (
    <nav className="flex flex-col gap-5 text-sm">
      {program.length > 0 && (
        <div>
          <div className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Program Management</div>
          {program.map((i) => (
            <NavLink key={i.href} item={i} active={active(i)} onClick={() => setDrawer(false)} />
          ))}
        </div>
      )}
      {other.length > 0 && (
        <div>
          <div className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Compte</div>
          {other.map((i) => (
            <NavLink key={i.href} item={i} active={active(i)} onClick={() => setDrawer(false)} />
          ))}
        </div>
      )}
    </nav>
  );

  return (
    <AccountContext.Provider value={acc}>
      <div className="min-h-dvh md:grid md:grid-cols-[250px_1fr]">
        {/* barre latérale (écran large) */}
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line-soft bg-surface/50 px-3 py-4 md:flex">
          <Link href="/" className="px-2">
            <Logo />
          </Link>
          <AccountBadge emoji={account.emoji} name={account.name} client={account.clientName} />
          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          <button className="btn btn-primary w-full" onClick={() => setAssistantOpen(true)}>
            <IconSparkles /> Assistant Claude
          </button>
        </aside>

        <div className="min-w-0">
          {/* en-tête */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line-soft bg-bg/85 px-3 backdrop-blur-md md:px-6">
            <button className="btn btn-ghost btn-sm md:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
              <IconMenu />
            </button>
            <div className="min-w-0 flex-1 truncate font-display text-base font-bold text-ink md:text-lg">
              <span className="md:hidden">
                {account.emoji} {account.name}
              </span>
              <span className="hidden md:inline">{pageTitle(pathname, base, acc.data.meetingTypes)}</span>
            </div>
            {account.modules.program && (
              <button className="btn btn-sm" onClick={() => setExportOpen(true)} title="Exporter en PowerPoint ou Excel">
                <IconDownload /> <span className="hidden sm:inline">Exporter</span>
              </button>
            )}
            <ThemeToggle />
            <UserMenu />
          </header>

          <main className="mx-auto w-full max-w-[1500px] px-3 pb-28 pt-4 md:px-6 md:pb-10">{children}</main>
        </div>
      </div>

      {/* tiroir mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setDrawer(false)}>
          <div className="fadein absolute inset-y-0 left-0 flex w-[82vw] max-w-xs flex-col gap-5 bg-surface px-3 py-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2">
              <Link href="/">
                <Logo />
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={() => setDrawer(false)} aria-label="Fermer">
                <IconX />
              </button>
            </div>
            <AccountBadge emoji={account.emoji} name={account.name} client={account.clientName} />
            <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          </div>
        </div>
      )}

      {/* navigation basse mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line-soft bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <BottomLink href="/" label="Comptes" icon={<IconHome />} active={false} />
        <BottomLink href={base} label="Kanban" icon={<IconKanban />} active={pathname === base} />
        <button className="flex flex-col items-center gap-0.5 py-2 text-[0.68rem] text-accent" onClick={() => setAssistantOpen(true)}>
          <IconSparkles />
          Assistant
        </button>
        <button className="flex flex-col items-center gap-0.5 py-2 text-[0.68rem] text-muted" onClick={() => setDrawer(true)}>
          <IconMenu />
          Menu
        </button>
      </nav>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <Assistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </AccountContext.Provider>
  );
}

function pageTitle(path: string, base: string, types: { id: string; name: string }[]) {
  if (path === base) return "Kanban";
  if (path.startsWith(`${base}/meetings/`)) return types.find((t) => path.includes(t.id))?.name ?? "Séances";
  if (path.startsWith(`${base}/risks`)) return "Risques & arbitrages";
  if (path.startsWith(`${base}/governance`)) return "Gouvernance";
  if (path.startsWith(`${base}/journal`)) return "Journal des modifications";
  if (path.startsWith(`${base}/finance`)) return "Finance management";
  if (path.startsWith(`${base}/provisioning`)) return "Provisioning management";
  if (path.startsWith(`${base}/settings`)) return "Paramètres du compte";
  return "";
}

function AccountBadge({ emoji, name, client }: { emoji: string; name: string; client: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface-2/60 px-3 py-2.5">
      <span className="text-2xl">{emoji}</span>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-ink">{name}</div>
        <div className="truncate text-xs text-muted">{client}</div>
      </div>
    </div>
  );
}

function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition ${active ? "bg-petrol/60 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2"}`}
      style={active ? { boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}
    >
      <span className={active ? "text-accent" : "text-muted"}>{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function BottomLink({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link href={href} className={`flex flex-col items-center gap-0.5 py-2 text-[0.68rem] ${active ? "text-accent" : "text-muted"}`}>
      {icon}
      {label}
    </Link>
  );
}
