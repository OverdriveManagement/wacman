"use client";

import useSWR from "swr";
import Link from "next/link";
import type { ReactNode } from "react";
import { fetcher } from "@/lib/api";
import { frDate, relative, tone } from "@/lib/format";
import type { CardLite, Dashboard } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { Callout, Empty, Pill, SectionTitle, Spinner } from "@/components/ui";

/** Tableau de bord du compte : où en est le sprint, ce qui est en retard, les risques, les séances et l'activité. */
export default function DashboardPage() {
  const acc = useAcc();
  const { data, error } = useSWR<Dashboard>(`${acc.base}/dashboard`, fetcher, { refreshInterval: 60_000 });
  if (error) return <Empty>Tableau de bord indisponible : {(error as Error).message}</Empty>;
  if (!data) return <Spinner />;
  const slug = acc.data.account.slug;
  const sp = data.sprint;
  const pct = sp && sp.total ? Math.round((sp.done / sp.total) * 100) : 0;
  const timePct = sp?.timeline ? Math.round((sp.timeline.daysElapsed / sp.timeline.daysTotal) * 100) : null;
  const alertTotal = data.alerts.reduce((n, a) => n + a.count, 0);

  return (
    <div className="space-y-8">
      <Callout text={acc.data.account.settings.intro} icon="🧭" />
      {/* indicateurs clés */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <Tile label={sp ? sp.name : "Sprint"} hint={sp ? `${frDate(sp.startDate)} au ${frDate(sp.endDate)}` : "Aucun sprint défini"}>
          {sp?.timeline ? (
            <>
              <Big>{sp.timeline.daysLeft} j</Big>
              <span className="text-sm text-muted">restants</span>
              <Meter value={timePct ?? 0} label={`${timePct} % du temps écoulé`} color="var(--slate)" />
            </>
          ) : (
            <Big>-</Big>
          )}
        </Tile>
        <Tile label="Livrables terminés" hint={sp ? `sur ${sp.total} carte(s) du sprint` : ""}>
          <Big>{sp ? `${sp.done}/${sp.total}` : "-"}</Big>
          <span className="text-sm text-muted">{pct} %</span>
          <Meter value={pct} label={`${pct} % des cartes terminées`} color="var(--teal)" />
        </Tile>
        <Tile label="Vigilance et alertes" hint="cartes non terminées">
          <Big>{alertTotal}</Big>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.alerts.map((a) => {
              const o = acc.opt.get(a.id);
              return o ? (
                <span key={a.id} className="inline-flex items-center gap-1 text-xs text-ink-2">
                  <Pill option={o} small /> {a.count}
                </span>
              ) : null;
            })}
          </div>
        </Tile>
        <Tile label="Échéances dépassées" hint="cartes non terminées" danger={data.overdueCount > 0}>
          <Big className={data.overdueCount ? "text-red" : ""}>{data.overdueCount}</Big>
          <span className="text-sm text-muted">{data.dueSoon.length} à échéance sous 15 jours</span>
        </Tile>
      </div>

      {sp && (
        <section>
          <SectionTitle icon="📊" actions={<Link href={`/a/${slug}`} className="btn btn-sm">Ouvrir le kanban</Link>}>
            Avancement du {sp.name}
          </SectionTitle>
          {sp.objective && <p className="-mt-2 mb-3 text-sm text-ink-2">Objectif : {sp.objective}</p>}
          <div className="card space-y-5 p-4">
            <StatusBar sprint={sp} />
            <div className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
              {sp.byStream
                .filter((s) => s.total)
                .map((s) => {
                  const st = acc.str.get(s.id);
                  const p = Math.round((s.done / s.total) * 100);
                  return (
                    <div key={s.id} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${st?.name} : ${s.done} terminée(s) sur ${s.total}, ${s.alerts} en vigilance ou alerte`}>
                      <span className="truncate text-ink-2">
                        {st?.emoji} {st?.name}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-teal" style={{ width: `${p}%` }} />
                      </span>
                      <span className="whitespace-nowrap text-xs text-muted">
                        {s.done}/{s.total}
                        {s.alerts > 0 && <span className="ml-2 font-semibold text-amber">{s.alerts} ⚠</span>}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <CardList title="Échéances dépassées" icon="⏰" cards={data.overdue} empty="Aucune échéance dépassée." total={data.overdueCount} danger />
        <CardList title="À échéance sous 15 jours" icon="📅" cards={data.dueSoon} empty="Rien à échéance dans les 15 prochains jours." />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        {data.mine === null ? (
          <section>
            <SectionTitle icon="🙋">Mes cartes</SectionTitle>
            <Empty>Pour voir vos cartes ici, rattachez votre compte utilisateur à votre fiche dans l'annuaire (Paramètres du compte, Annuaire).</Empty>
          </section>
        ) : (
          <CardList title="Mes cartes en cours" icon="🙋" cards={data.mine} empty="Aucune carte en cours dont vous êtes porteur." />
        )}
        <section>
          <SectionTitle icon="🛡️" actions={<Link href={`/a/${slug}/risks`} className="btn btn-sm">Tous les risques</Link>}>
            Risques ouverts : {data.risks.open} sur {data.risks.total}
          </SectionTitle>
          <div className="card space-y-3 p-4">
            {data.risks.byCriticality.map((c) => {
              const o = acc.opt.get(c.id);
              const max = Math.max(1, ...data.risks.byCriticality.map((x) => x.count));
              return (
                <div key={c.id} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm" title={`${o?.label} : ${c.count} risque(s) ouvert(s)`}>
                  <span className="truncate">
                    <Pill option={o} small />
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full rounded-full" style={{ width: `${(c.count / max) * 100}%`, background: tone[o?.color ?? "slate"] }} />
                  </span>
                  <span className="text-right text-xs text-ink-2">{c.count}</span>
                </div>
              );
            })}
            {data.risks.overdue.length > 0 && (
              <div className="border-t border-line-soft pt-3">
                <div className="label">Échéance de traitement dépassée</div>
                <ul className="space-y-1">
                  {data.risks.overdue.map((r) => (
                    <li key={r.id}>
                      <Link href={`/a/${slug}/risks?risk=${r.id}`} className="flex min-w-0 items-baseline gap-2 text-sm hover:text-accent">
                        <span className="whitespace-nowrap text-xs font-semibold text-red">{frDate(r.dueDate)}</span>
                        <span className="truncate text-ink-2">{r.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <section>
          <SectionTitle icon="🗓️">Séances</SectionTitle>
          <div className="card divide-y divide-line-soft">
            {data.meetings.map((m) => {
              const t = acc.data.meetingTypes.find((x) => x.id === m.typeId);
              return (
                <Link key={m.typeId} href={`/a/${slug}/meetings/${m.typeId}${m.last ? `?m=${m.last.id}` : ""}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2/60">
                  <span className="text-lg">{t?.emoji || "🗓️"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{t?.name}</span>
                    <span className="block text-xs text-muted">
                      {m.last ? `Dernière : ${frDate(m.last.date)}` : "Aucune séance passée"}
                      {m.next ? `. Prochaine préparée : ${frDate(m.next)}` : ""}
                    </span>
                  </span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{m.count}</span>
                </Link>
              );
            })}
            {!data.meetings.length && <div className="p-4 text-sm text-muted">Aucun type de séance actif.</div>}
          </div>
        </section>
        <section>
          <SectionTitle icon="🕘" actions={<Link href={`/a/${slug}/journal`} className="btn btn-sm">Journal complet</Link>}>
            Activité récente
          </SectionTitle>
          <div className="card divide-y divide-line-soft">
            {data.activity.map((e) => (
              <div key={e.id} className="px-4 py-2.5 text-sm">
                <div className="text-ink-2">{e.summary}</div>
                <div className="text-xs text-muted">
                  {e.userName || "Système"}
                  {e.viaAssistant ? " via Claude" : ""}, {relative(e.createdAt)}
                </div>
              </div>
            ))}
            {!data.activity.length && <div className="p-4 text-sm text-muted">Aucune activité pour l'instant.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile({ label, hint, children, danger }: { label: string; hint?: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className="card p-4" style={danger ? { borderColor: "color-mix(in srgb, var(--red) 45%, transparent)" } : undefined}>
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">{children}</div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Big({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-display text-3xl font-bold text-ink ${className}`}>{children}</span>;
}

function Meter({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label} title={label}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}

/** Répartition des cartes du sprint par statut : une barre segmentée et sa légende. */
function StatusBar({ sprint }: { sprint: NonNullable<Dashboard["sprint"]> }) {
  const acc = useAcc();
  const parts = sprint.byStatus.filter((s) => s.count > 0);
  if (!sprint.total) return <p className="text-sm text-muted">Aucune carte dans ce sprint.</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px]">
        {parts.map((p) => {
          const o = p.id ? acc.opt.get(p.id) : null;
          return (
            <div
              key={p.id ?? "none"}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: p.count, flexBasis: 0, background: o ? tone[o.color] : "var(--slate)" }}
              title={`${o?.label ?? "Sans statut"} : ${p.count} carte(s)`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {parts.map((p) => {
          const o = p.id ? acc.opt.get(p.id) : null;
          return (
            <span key={p.id ?? "none"} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: o ? tone[o.color] : "var(--slate)" }} />
              {o?.label ?? "Sans statut"} <span className="text-muted">{p.count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CardList({ title, icon, cards, empty, total, danger }: { title: string; icon: string; cards: CardLite[]; empty: string; total?: number; danger?: boolean }) {
  const acc = useAcc();
  const slug = acc.data.account.slug;
  return (
    <section>
      <SectionTitle icon={icon}>
        {title}
        {total !== undefined && total > cards.length ? ` (${cards.length} sur ${total})` : cards.length ? ` (${cards.length})` : ""}
      </SectionTitle>
      {!cards.length ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="card divide-y divide-line-soft">
          {cards.map((c) => {
            const s = c.streamId ? acc.str.get(c.streamId) : null;
            const lvl = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;
            return (
              <Link key={c.id} href={`/a/${slug}?card=${c.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2/60">
                <span className={`w-12 shrink-0 text-xs font-semibold ${danger ? "text-red" : "text-ink-2"}`}>{frDate(c.dueDate, false)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">
                    {c.emoji && <span className="mr-1">{c.emoji}</span>}
                    {c.title}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {[s ? `${s.emoji} ${s.name}` : "", c.ownerId ? acc.ctc.get(c.ownerId)?.name : "", `#${c.ref}`].filter(Boolean).join(", ")}
                  </span>
                </span>
                {lvl && <span title={lvl.label}>{lvl.emoji || "●"}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
