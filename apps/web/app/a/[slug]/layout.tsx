"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "@/lib/hooks";
import { AccountContext, EditModeContext } from "@/components/AccountContext";
import { Logo, ThemeToggle } from "@/components/Brand";
import { UserMenu } from "@/components/TopBar";
import { Spinner } from "@/components/ui";
import { ExportDialog } from "@/components/ExportDialog";
import { Assistant } from "@/components/Assistant";
import { SearchPalette } from "@/components/SearchPalette";
import { MeetingTypeModal } from "@/components/MeetingTypeModal";
import {
  IconBuilding,
  IconChevron,
  IconDownload,
  IconEdit,
  IconEuro,
  IconGauge,
  IconSearch,
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [newType, setNewType] = useState(false);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // menu latéral réduit aux pictos : préférence gardée dans le navigateur
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("wacman-sidebar") === "collapsed");
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const toggleSidebar = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("wacman-sidebar", c ? "open" : "collapsed");
      } catch {
        /* stockage indisponible */
      }
      return !c;
    });
  };

  // Ctrl+K ou ⌘K : recherche globale ; « / » hors champ de saisie aussi
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      // dans une zone de texte, Ctrl+K insère un lien (barre de mise en forme) : pas de recherche
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        if (e.defaultPrevented || el?.tagName === "TEXTAREA") return;
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // une erreur passagère de rafraîchissement ne remplace pas l'écran : seul un premier chargement en échec l'affiche
  if (acc.error && !acc.data) {
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
        { href: `${base}/dashboard`, label: "Tableau de bord", icon: <IconGauge /> },
        { href: base, label: "Kanban", icon: <IconKanban />, exact: true },
        ...acc.data.meetingTypes
          .filter((m) => m.active)
          .map((m) => ({ href: `${base}/meetings/${m.id}`, label: m.name, icon: <span className="w-[18px] text-center">{m.emoji || "🗓️"}</span> })),
        { href: `${base}/followup`, label: "Actions & décisions", icon: <span className="w-[18px] text-center">✅</span> },
        { href: `${base}/streams`, label: "Revue de stream", icon: <span className="w-[18px] text-center">🔎</span> },
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
  const editMode = editing && acc.isAdmin;

  const navOf = (compact: boolean) => (
    <nav className={`flex flex-col text-sm ${compact ? "gap-3" : "gap-5"}`}>
      {program.length > 0 && (
        <div>
          {compact ? (
            <div className="mx-auto mb-1.5 h-px w-6 bg-line-soft" />
          ) : (
            <div className="mb-1.5 flex items-center justify-between px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">
              Program Management
              {editMode && (
                <button className="rounded px-1 text-base leading-none text-muted hover:text-accent" onClick={() => setNewType(true)} title="Nouveau type de séance" aria-label="Nouveau type de séance">
                  +
                </button>
              )}
            </div>
          )}
          {program.map((i) => (
            <NavLink key={i.href} item={i} active={active(i)} compact={compact} onClick={() => setDrawer(false)} />
          ))}
        </div>
      )}
      {other.length > 0 && (
        <div>
          {compact ? <div className="mx-auto mb-1.5 h-px w-6 bg-line-soft" /> : <div className="mb-1.5 px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted">Compte</div>}
          {other.map((i) => (
            <NavLink key={i.href} item={i} active={active(i)} compact={compact} onClick={() => setDrawer(false)} />
          ))}
        </div>
      )}
    </nav>
  );
  const nav = navOf(false);

  return (
    <AccountContext.Provider value={acc}>
      <EditModeContext.Provider value={{ editing: editMode, setEditing }}>
      <div className={`min-h-dvh md:grid ${collapsed ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[250px_1fr]"}`}>
        {/* barre latérale (écran large), rétractable en simple colonne de pictos */}
        <aside className={`sticky top-0 hidden h-dvh flex-col border-r border-line-soft bg-surface/50 py-4 md:flex ${collapsed ? "items-center gap-4 px-2" : "gap-6 px-3"}`}>
          <Link href="/" className={collapsed ? "" : "px-2"} title="Tous les comptes">
            <Logo compact={collapsed} />
          </Link>
          {collapsed ? (
            <span className="text-2xl" title={`${account.name} (${account.clientName})`}>
              {account.emoji}
            </span>
          ) : (
            <AccountBadge emoji={account.emoji} name={account.name} client={account.clientName} />
          )}
          <div className={`min-h-0 flex-1 overflow-y-auto ${collapsed ? "w-full" : ""}`}>{navOf(collapsed)}</div>
          <button className={`btn btn-primary ${collapsed ? "!px-2" : "w-full"}`} onClick={() => setAssistantOpen(true)} title="Assistant Claude" aria-label="Assistant Claude">
            <IconSparkles /> {!collapsed && "Assistant Claude"}
          </button>
          <button
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted transition hover:bg-surface-2 hover:text-ink ${collapsed ? "" : "self-start"}`}
            onClick={toggleSidebar}
            title={collapsed ? "Déplier le menu" : "Réduire le menu"}
            aria-label={collapsed ? "Déplier le menu" : "Réduire le menu"}
          >
            <IconChevron className={collapsed ? "" : "rotate-180"} width={16} height={16} />
            {!collapsed && "Réduire le menu"}
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
            {acc.isAdmin && (
              <button
                className={`btn btn-sm ${editMode ? "btn-primary" : ""}`}
                onClick={() => setEditing(!editing)}
                aria-pressed={editMode}
                title={editMode ? "Quitter le mode édition" : "Mode édition : modifier la structure (sprints, colonnes, streams, types de séance, listes)"}
              >
                <IconEdit /> <span className="hidden lg:inline">{editMode ? "Terminer l'édition" : "Mode édition"}</span>
              </button>
            )}
            <button className="btn btn-sm" onClick={() => setSearchOpen(true)} title="Rechercher (Ctrl+K)" aria-label="Rechercher">
              <IconSearch /> <span className="hidden lg:inline">Rechercher</span>
              <kbd className="hidden rounded border border-line px-1 text-[0.65rem] text-muted xl:inline">Ctrl K</kbd>
            </button>
            {account.modules.program && (
              <button className="btn btn-sm" onClick={() => setExportOpen(true)} title="Exporter en PowerPoint ou Excel">
                <IconDownload /> <span className="hidden sm:inline">Exporter</span>
              </button>
            )}
            <ThemeToggle />
            <UserMenu />
          </header>

          {editMode && (
            <div className="flex items-center gap-3 border-b px-3 py-1.5 text-xs md:px-6" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}>
              <span className="font-semibold text-accent">Mode édition</span>
              <span className="hidden text-ink-2 sm:inline">« + » pour créer, « ⋯ » sur un en-tête pour modifier la structure (sprints, colonnes, streams, types de séance, listes, comitologie).</span>
              <button className="ml-auto font-semibold text-accent hover:underline" onClick={() => setEditing(false)}>
                Terminer
              </button>
            </div>
          )}
          <main className={`mx-auto w-full px-3 pb-28 pt-4 md:px-6 md:pb-10 ${collapsed ? "max-w-[1800px]" : "max-w-[1500px]"}`}>{children}</main>
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
            <Link href="/" className="btn w-full" onClick={() => setDrawer(false)}>
              <IconHome /> Tous les comptes
            </Link>
          </div>
        </div>
      )}

      {/* navigation basse mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line-soft bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <BottomLink href={`${base}/dashboard`} label="Bord" icon={<IconGauge />} active={pathname === `${base}/dashboard`} />
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
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MeetingTypeModal item={newType ? "new" : null} onClose={() => setNewType(false)} />
      </EditModeContext.Provider>
    </AccountContext.Provider>
  );
}

function pageTitle(path: string, base: string, types: { id: string; name: string }[]) {
  if (path === base) return "Kanban";
  if (path.startsWith(`${base}/dashboard`)) return "Tableau de bord";
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

function NavLink({ item, active, onClick, compact = false }: { item: NavItem; active: boolean; onClick?: () => void; compact?: boolean }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={compact ? item.label : undefined}
      aria-label={compact ? item.label : undefined}
      className={`flex items-center rounded-lg py-2 transition ${compact ? "justify-center px-0" : "gap-2.5 px-3"} ${active ? "bg-petrol/60 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2"}`}
      style={active ? { boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}
    >
      <span className={active ? "text-accent" : "text-muted"}>{item.icon}</span>
      {!compact && <span className="truncate">{item.label}</span>}
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
