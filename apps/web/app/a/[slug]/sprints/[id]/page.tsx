"use client";

import useSWR from "swr";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { download, fetcher, toast } from "@/lib/api";
import { frDate } from "@/lib/format";
import { useMe } from "@/lib/hooks";
import { partyLabel } from "@/lib/followup";
import { copyRich, sprintReviewHtml, sprintReviewSubject, sprintReviewText } from "@/lib/reportHtml";
import type { ReviewCard, SprintReview } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { CardModal } from "@/components/CardModal";
import { Menu } from "@/components/config";
import { ReviewCardRow, ReviewSection, StatTile, useOpenCard } from "@/components/Review";
import { Empty, Spinner } from "@/components/ui";
import { IconCopy } from "@/components/icons";

const STATE: Record<string, string> = { UPCOMING: "À venir", CURRENT: "En cours", DONE: "Terminé" };

/**
 * Bilan d'un sprint (B9) : à la bascule, ce qui a été livré, reporté, en alerte,
 * les décisions prises et les actions closes ou ouvertes ; e-mail mis en forme et diapositive PowerPoint.
 */
export default function SprintReviewPage() {
  const acc = useAcc();
  const router = useRouter();
  const { data: me } = useMe();
  const { id } = useParams<{ id: string }>();
  const { data, error, mutate } = useSWR<SprintReview>(`${acc.base}/sprints/${id}/review`, fetcher);
  const cardView = useOpenCard();
  const sprints = [...acc.data.sprints].sort((a, b) => a.order - b.order);
  const slug = acc.data.account.slug;

  if (error) return <Empty>Sprint introuvable.</Empty>;
  if (!data) return <Spinner />;
  const r = data;
  const pct = r.stats.total ? Math.round((r.stats.done / r.stats.total) * 100) : 0;
  const signature = me?.user.name?.split(" ")[0];
  const subject = sprintReviewSubject(r, acc);
  const copy = async () => {
    try {
      return await copyRich(sprintReviewHtml(r, acc, signature), sprintReviewText(r, acc, signature));
    } catch {
      toast("error", "Copie impossible dans ce navigateur.");
      return null;
    }
  };
  const openGmail = async () => {
    if (!(await copy())) return;
    const w = window.open(`https://mail.google.com/mail/?${new URLSearchParams({ view: "cm", fs: "1", su: subject }).toString()}`, "_blank", "noopener");
    toast(w ? "success" : "error", w ? "Bilan copié : collez-le dans le message Gmail (Ctrl+V ou Cmd+V)." : "Le navigateur a bloqué l'ouverture de Gmail. Le bilan est copié.");
  };
  const byStream = (list: ReviewCard[]) => {
    const groups = new Map<string, ReviewCard[]>();
    for (const c of list) groups.set(c.streamId ?? "", [...(groups.get(c.streamId ?? "") ?? []), c]);
    return [...groups.entries()].sort(([a], [b]) => (acc.str.get(a)?.order ?? 999) - (acc.str.get(b)?.order ?? 999));
  };
  const cardGroups = (list: ReviewCard[], empty: string, details = false) =>
    !list.length ? (
      <p className="text-sm text-muted">{empty}</p>
    ) : (
      <div className="space-y-3">
        {byStream(list).map(([sid, cards]) => (
          <div key={sid || "none"}>
            <div className="text-xs font-extrabold uppercase tracking-wider text-ocre">
              {sid ? acc.str.get(sid)?.name : "Sans stream"} <span className="font-semibold text-muted">({cards.length})</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {cards.map((c) => (
                <ReviewCardRow key={c.id} c={c} onOpen={cardView.open} details={details} showStatus={!details} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-ink">📊 Bilan du {r.sprint.name}</h1>
          <p className="text-sm text-muted">
            {STATE[r.sprint.state]}
            {r.sprint.startDate && `, du ${frDate(r.sprint.startDate)} au ${frDate(r.sprint.endDate)}`}
            {r.switchedAt && `, basculé le ${frDate(r.switchedAt.slice(0, 10))}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <select className="input !w-auto" value={r.sprint.id} onChange={(e) => router.push(`/a/${slug}/sprints/${e.target.value}`)} aria-label="Sprint">
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm"
            onClick={async () => {
              const how = await copy();
              if (how) toast("success", how === "rich" ? "Bilan copié avec sa mise en forme : collez-le dans votre e-mail." : "Bilan copié en texte simple.");
            }}
          >
            <IconCopy /> Copier l'e-mail
          </button>
          <Menu
            label="Autres exports du bilan"
            items={[
              { label: "Nouveau message Gmail (objet rempli)", onClick: openGmail },
              {
                label: "Copier l'objet",
                onClick: async () => {
                  await navigator.clipboard.writeText(subject);
                  toast("success", `Objet copié : ${subject}`);
                },
              },
              "sep",
              { label: "Diapositive PowerPoint du bilan", onClick: () => download(`${acc.base}/export/deck.pptx?sections=sprintReview&sprintId=${r.sprint.id}`) },
            ]}
          />
        </div>
      </div>

      {(r.sprint.objective.trim() || r.sprint.clientMilestone.trim()) && (
        <div className="grid gap-2 md:grid-cols-2">
          {r.sprint.objective.trim() && (
            <div className="rounded-xl border border-line-soft p-3 text-sm">
              <div className="label">Objectif du sprint</div>
              <p className="whitespace-pre-line text-ink-2">{r.sprint.objective}</p>
            </div>
          )}
          {r.sprint.clientMilestone.trim() && (
            <div className="rounded-xl border border-line-soft p-3 text-sm">
              <div className="label">Échéance {acc.data.account.clientName}</div>
              <p className="whitespace-pre-line text-ink-2">{r.sprint.clientMilestone}</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatTile label="Livrables au périmètre" value={r.stats.total} />
        <StatTile label="Terminés" value={`${r.stats.done}`} tone="teal" hint={`${pct} % du périmètre`} />
        <StatTile label={r.sprint.state === "DONE" && r.next ? `Reportés au ${r.next.name}` : "Restant à terminer"} value={r.stats.carried} tone={r.stats.carried ? "ocre" : "ink"} />
        <StatTile label="En vigilance ou alerte" value={r.stats.alerts} tone={r.stats.alerts ? "red" : "ink"} />
        <StatTile label="Décisions prises" value={r.decisions.length} tone="accent" hint={`${r.actionsClosed.length} action${r.actionsClosed.length > 1 ? "s" : ""} close${r.actionsClosed.length > 1 ? "s" : ""}`} />
      </div>
      {r.stats.total > 0 && (
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-label={`${pct} % terminé`}>
          <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewSection icon="✅" title="Livrables terminés" count={r.done.length}>
          {cardGroups(r.done, "Aucun livrable terminé.")}
        </ReviewSection>
        <ReviewSection icon="↪️" title={r.sprint.state === "DONE" ? (r.next ? `Reportés au ${r.next.name}` : "Reportés") : "Restant à terminer"} count={r.carried.length}>
          {cardGroups(r.carried, r.sprint.state === "DONE" ? "Aucun livrable reporté." : "Tout est terminé.")}
        </ReviewSection>
      </div>

      {r.alerts.length > 0 && (
        <ReviewSection icon="🚨" title="Points de vigilance" count={r.alerts.length}>
          <ul className="divide-y divide-line-soft">
            {r.alerts.map((c) => (
              <ReviewCardRow key={c.id} c={c} onOpen={cardView.open} showStream />
            ))}
          </ul>
        </ReviewSection>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewSection icon="⚖️" title="Décisions prises pendant le sprint" count={r.decisions.length}>
          {!r.decisions.length ? (
            <p className="text-sm text-muted">Aucune décision consignée sur la période.</p>
          ) : (
            <ul className="space-y-1.5">
              {r.decisions.map((d) => (
                <li key={d.id} className="text-sm">
                  <span className="text-xs text-muted">{d.decidedOn ? frDate(d.decidedOn, false) : ""}</span> <b className="text-ink">{d.title}</b>
                  {d.streamId && <span className="ml-1.5 text-xs font-semibold text-ocre">{acc.str.get(d.streamId)?.name}</span>}
                  {d.detail.trim() && <p className="whitespace-pre-line text-xs text-ink-2">{d.detail}</p>}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/a/${slug}/followup`} className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">
            Registre complet des décisions
          </Link>
        </ReviewSection>
        <ReviewSection icon="📌" title="Actions" count={r.actionsOpen.length}>
          <p className="mb-2 text-xs text-muted">
            {r.actionsClosed.length} action{r.actionsClosed.length > 1 ? "s" : ""} close{r.actionsClosed.length > 1 ? "s" : ""} pendant le sprint, {r.actionsOpen.length} ouverte{r.actionsOpen.length > 1 ? "s" : ""} à date.
          </p>
          {r.actionsOpen.length > 0 && (
            <ul className="space-y-1">
              {r.actionsOpen.slice(0, 15).map((a) => (
                <li key={a.id} className="text-sm text-ink-2">
                  <span className="text-xs font-semibold text-muted">{partyLabel(a.party, acc)}</span> {a.title}
                  {a.dueDate && <span className="ml-1 text-xs text-muted">(échéance {frDate(a.dueDate, false)})</span>}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/a/${slug}/followup`} className="mt-2 inline-block text-xs font-semibold text-accent hover:underline">
            Relevé complet des actions
          </Link>
        </ReviewSection>
      </div>

      {r.highlights.length > 0 && (
        <ReviewSection icon="📰" title="Faits marquants de la période" count={r.highlights.length}>
          <ul className="grid gap-2 md:grid-cols-2">
            {r.highlights.map((h) => (
              <li key={h.id} className="text-sm">
                <span className="text-xs text-muted">{frDate(h.date, false)}</span> <b className="text-ink">{h.title}</b>
                {h.detail.trim() && <p className="line-clamp-2 whitespace-pre-line text-xs text-ink-2">{h.detail}</p>}
              </li>
            ))}
          </ul>
        </ReviewSection>
      )}

      {r.next && (
        <p className="text-sm text-muted">
          Sprint suivant :{" "}
          <Link className="font-semibold text-accent hover:underline" href={`/a/${slug}/sprints/${r.next.id}`}>
            {r.next.name}
          </Link>
          {r.next.startDate && ` (du ${frDate(r.next.startDate)} au ${frDate(r.next.endDate)})`}
        </p>
      )}
      <CardModal card={cardView.card} onClose={cardView.close} onChanged={() => mutate()} />
    </div>
  );
}
