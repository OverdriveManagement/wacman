"use client";

import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { fetcher } from "@/lib/api";
import { frDate, relative } from "@/lib/format";
import type { Card, StreamReview } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { ActionsList, DecisionsList } from "@/components/FollowUp";
import { Markdown } from "@/components/Markdown";
import { CardModal } from "@/components/CardModal";
import { ReviewCardRow, ReviewSection, StatTile, useOpenCard, usePresentation } from "@/components/Review";
import { Empty, Pill, Spinner, Toggle } from "@/components/ui";
import { IconChevron } from "@/components/icons";
import { daysSince } from "@/lib/freshness";
import { useFreshness } from "@/components/Freshness";

/**
 * Revue de stream (B7) : support de l'heure hebdomadaire avec chaque stream leader.
 * Dernier statut, livrables par statut avec leur fraîcheur, actions, décisions, risques,
 * faits marquants et activité récente ; mode présentation en plein écran.
 */
export default function StreamReviewPage() {
  const acc = useAcc();
  const params = useSearchParams();
  const streams = [...acc.data.streams].filter((s) => s.active).sort((a, b) => a.order - b.order);
  const [streamId, setStreamId] = useState<string | null>(() => {
    const s = params.get("s");
    return s && streams.some((x) => x.id === s) ? s : (streams[0]?.id ?? null);
  });
  const [details, setDetails] = useState(false);
  const { data, mutate, error } = useSWR<StreamReview>(streamId ? `${acc.base}/streams/${streamId}/review` : null, fetcher);
  const cardView = useOpenCard();
  const fresh = useFreshness();
  const i = streams.findIndex((s) => s.id === streamId);
  const go = (id: string | null) => {
    if (!id) return;
    setStreamId(id);
    // l'adresse suit le stream affiché, sans recharger la page (lien partageable)
    window.history.replaceState(null, "", `?s=${id}`);
  };
  const prev = () => go(streams[(i - 1 + streams.length) % streams.length]?.id ?? null);
  const next = () => go(streams[(i + 1) % streams.length]?.id ?? null);
  const pres = usePresentation(prev, next);

  if (!streams.length) return <Empty>Aucun stream actif. Ajoutez-en depuis la page Gouvernance.</Empty>;

  const picker = (
    <div className="flex items-center gap-1">
      <button className="btn btn-ghost btn-sm !px-1.5" onClick={prev} aria-label="Stream précédent" title="Stream précédent">
        <IconChevron className="rotate-180" />
      </button>
      <select className="input !w-auto min-w-0 font-display !text-base font-bold text-heading" value={streamId ?? ""} onChange={(e) => go(e.target.value)} aria-label="Stream">
        {streams.map((s) => (
          <option key={s.id} value={s.id}>
            {s.emoji ? `${s.emoji} ` : ""}
            {s.name}
          </option>
        ))}
      </select>
      <button className="btn btn-ghost btn-sm !px-1.5" onClick={next} aria-label="Stream suivant" title="Stream suivant">
        <IconChevron />
      </button>
    </div>
  );

  const body = (() => {
    if (error) return <Empty>Revue indisponible.</Empty>;
    if (!data || data.stream.id !== streamId) return <Spinner />;
    const statuses = acc.byKind("CARD_STATUS");
    const lastLevel = fresh.levels.length > 1 ? fresh.levels[fresh.levels.length - 2].maxDays : null;
    const open = data.cards.filter((c) => !acc.isDone(c.statusId));
    const stale = lastLevel ? open.filter((c) => (daysSince(c.contentUpdatedAt) ?? 0) > lastLevel).length : 0;
    const alerts = open.filter((c) => c.alertLevelId).length;
    const done = data.cards.length - open.length;
    const st = data.status;
    const meetingType = st ? acc.data.meetingTypes.find((t) => t.id === st.meetingTypeId) : null;
    const groups = [...statuses.map((s) => ({ id: s.id as string | null, label: s.label, emoji: s.emoji })), { id: null, label: "Sans statut", emoji: "" }]
      .map((g) => ({ ...g, cards: data.cards.filter((c) => (c.statusId ?? null) === g.id || (g.id === null && c.statusId && !acc.opt.get(c.statusId))) }))
      .filter((g) => g.cards.length);
    // activité : une ligne par carte et par type de modification (la plus récente), avec le nombre d'occurrences
    const activity = (() => {
      const seen = new Map<string, (typeof data.activity)[number] & { n: number }>();
      for (const a of data.activity) {
        const k = `${a.entityId}|${a.summary}`;
        const cur = seen.get(k);
        if (cur) cur.n++;
        else seen.set(k, { ...a, n: 1 });
      }
      return [...seen.values()].slice(0, 12);
    })();
    const pendingDecisions = data.decisions.filter((d) => d.status === "PENDING");
    const takenDecisions = data.decisions.filter((d) => d.status === "TAKEN");
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="font-display text-xl font-bold text-heading">
            {data.stream.emoji} {data.stream.name}
          </h2>
          {data.stream.leader && <span className="text-sm text-ink-2">Stream leader : {data.stream.leader}</span>}
          {data.stream.prescriber && <span className="text-sm text-ink-2">Prescripteur : {data.stream.prescriber}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <StatTile label="Livrables" value={data.cards.length} />
          <StatTile label="Terminés" value={done} tone="teal" />
          <StatTile label="En vigilance ou alerte" value={alerts} tone={alerts ? "red" : "ink"} />
          <StatTile label="Actions ouvertes" value={data.actions.filter((a) => a.status === "OPEN").length} tone="accent" />
          <StatTile label="Sans mise à jour" value={stale} tone={stale ? "ocre" : "ink"} hint={lastLevel ? `depuis plus de ${lastLevel} jours` : undefined} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ReviewSection icon="🌦️" title="Dernier statut">
            {!st ? (
              <p className="text-sm text-muted">Aucun statut saisi en séance pour ce stream.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted">
                  {meetingType ? (
                    <Link className="font-semibold text-accent hover:underline" href={`/a/${acc.data.account.slug}/meetings/${meetingType.id}?m=${st.meetingId}`}>
                      {meetingType.emoji} {meetingType.name} du {frDate(st.date)}
                    </Link>
                  ) : (
                    `Séance du ${frDate(st.date)}`
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {st.statusIds.map((id) => (
                    <Pill key={id} option={acc.opt.get(id)} />
                  ))}
                  {!st.statusIds.length && <span className="text-xs text-muted">Statut non renseigné</span>}
                </div>
                {st.progress.trim() && (
                  <div>
                    <div className="label">Avancement</div>
                    <Markdown text={st.progress} className="text-sm" />
                  </div>
                )}
                {st.alerts.trim() && (
                  <div>
                    <div className="label !text-red">Alertes et prérequis</div>
                    <Markdown text={st.alerts} className="text-sm" />
                  </div>
                )}
                {data.previousStatus && (
                  <p className="flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-2 text-xs text-muted">
                    Statut précédent ({frDate(data.previousStatus.date)}) :
                    {data.previousStatus.statusIds.map((id) => (
                      <Pill key={id} option={acc.opt.get(id)} small />
                    ))}
                    {!data.previousStatus.statusIds.length && "non renseigné"}
                  </p>
                )}
              </div>
            )}
          </ReviewSection>

          <ReviewSection icon="⚖️" title="Décisions" count={data.decisions.length}>
            <div className="space-y-3">
              <div>
                <div className="label mb-1">Attendues</div>
                <DecisionsList decisions={pendingDecisions} defaults={{ streamId: data.stream.id }} status="PENDING" onChanged={() => mutate()} emptyText="Aucune décision attendue." />
              </div>
              {takenDecisions.length > 0 && (
                <div>
                  <div className="label mb-1">Prises ces 30 derniers jours</div>
                  <DecisionsList decisions={takenDecisions} defaults={{ streamId: data.stream.id, decidedOn: new Date().toISOString().slice(0, 10) }} status="TAKEN" onChanged={() => mutate()} showSeries />
                </div>
              )}
            </div>
          </ReviewSection>
        </div>

        <ReviewSection icon="📦" title="Livrables" count={data.cards.length} actions={<Toggle checked={details} onChange={setDetails} label="Avancement et prochaines étapes" />}>
          {!groups.length ? (
            <p className="text-sm text-muted">Aucune carte dans ce stream.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <div key={g.id ?? "none"}>
                  <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-accent">
                    {g.emoji} {g.label} <span className="font-semibold text-muted">({g.cards.length})</span>
                  </div>
                  <ul className="divide-y divide-line-soft">
                    {g.cards.map((c) => (
                      <ReviewCardRow key={c.id} c={c} onOpen={cardView.open} details={details} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </ReviewSection>

        <ReviewSection icon="✅" title="Actions" count={data.actions.filter((a) => a.status === "OPEN").length}>
          <ActionsList actions={[...data.actions].sort((a, b) => (a.status === b.status ? (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") : a.status === "OPEN" ? -1 : 1))} defaults={{ streamId: data.stream.id }} onChanged={() => mutate()} showSeries emptyText="Aucune action ouverte pour ce stream." />
        </ReviewSection>

        <div className="grid gap-4 lg:grid-cols-3">
          <ReviewSection icon="🛡️" title="Risques ouverts" count={data.risks.length}>
            {!data.risks.length ? (
              <p className="text-sm text-muted">Aucun risque ouvert.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.risks.map((r) => (
                  <li key={r.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill option={r.criticalityId ? acc.opt.get(r.criticalityId) : null} small />
                      <Link href={`/a/${acc.data.account.slug}/risks`} className="text-ink hover:text-accent hover:underline">
                        {r.title}
                      </Link>
                    </div>
                    {(r.ownerId || r.dueDate) && (
                      <div className="text-xs text-muted">
                        {r.ownerId ? acc.ctc.get(r.ownerId)?.name : ""}
                        {r.ownerId && r.dueDate ? ", " : ""}
                        {r.dueDate ? `échéance ${frDate(r.dueDate)}` : ""}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ReviewSection>
          <ReviewSection icon="📰" title="Faits marquants récents" count={data.highlights.length}>
            {!data.highlights.length ? (
              <p className="text-sm text-muted">Aucun fait marquant pour ce stream.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.highlights.map((h) => (
                  <li key={h.id} className="text-sm">
                    <span className="text-xs text-muted">{frDate(h.date, false)}</span> <b className="text-ink">{h.title}</b>
                    {h.detail.trim() && <p className="line-clamp-3 whitespace-pre-line text-xs text-ink-2">{h.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </ReviewSection>
          <ReviewSection icon="🕘" title="Activité des 14 derniers jours">
            {!activity.length ? (
              <p className="text-sm text-muted">Aucune modification des cartes du stream.</p>
            ) : (
              <ul className="space-y-1">
                {activity.map((a) => (
                  <li key={a.id} className="text-xs text-ink-2">
                    <button className="text-left hover:text-accent hover:underline" onClick={() => cardView.open(a.entityId)}>
                      {a.summary}
                    </button>{" "}
                    <span className="text-muted">
                      ({a.n > 1 ? `${a.n} fois, ` : ""}
                      {a.userName || "?"}, {relative(a.createdAt)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ReviewSection>
        </div>
      </div>
    );
  })();

  return (
    <div className="space-y-5">
      {!pres.on && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">🔎 Revue de stream</h1>
            <p className="text-sm text-muted">Le support du point hebdomadaire avec chaque stream leader.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {picker}
            <button className="btn btn-primary btn-sm" onClick={pres.start}>
              🖥️ Présenter
            </button>
          </div>
        </div>
      )}
      {pres.wrap(body, picker)}
      <CardModal card={cardView.card} onClose={cardView.close} onChanged={() => mutate()} />
    </div>
  );
}
