"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { fetcher } from "@/lib/api";
import { useAccount } from "@/lib/hooks";
import { frDate, longDate, tone } from "@/lib/format";
import type { Action, Decision, Meeting, MeetingType } from "@/lib/types";
import { Markdown } from "@/components/Markdown";
import { actionsForMeeting, decisionsForMeeting, partyLabel, stripDecisions } from "@/lib/followup";

/** Vue d'impression d'une séance (compte rendu), à imprimer ou enregistrer en PDF depuis le navigateur. */
export default function PrintMeetingPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const acc = useAccount(slug);
  const { data: meeting, error } = useSWR<Meeting & { meetingType: MeetingType }>(`/api/accounts/${slug}/meetings/${id}`, fetcher);
  const blocks = meeting?.meetingType.blocks ?? [];
  const follow = blocks.includes("ACTIONS") || blocks.includes("DECISIONS");
  const { data: series } = useSWR<Meeting[]>(meeting && follow ? `/api/accounts/${slug}/meetings?typeId=${meeting.meetingTypeId}` : null, fetcher);
  const { data: actions } = useSWR<Action[]>(meeting && blocks.includes("ACTIONS") ? `/api/accounts/${slug}/e/action` : null, fetcher);
  const { data: decisions } = useSWR<Decision[]>(meeting && blocks.includes("DECISIONS") ? `/api/accounts/${slug}/e/decision` : null, fetcher);

  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "light";
    return () => {
      if (prev) document.documentElement.dataset.theme = prev;
      else delete document.documentElement.dataset.theme;
    };
  }, []);

  const ready = !!(meeting && acc.data && (!follow || (series && (!blocks.includes("ACTIONS") || actions) && (!blocks.includes("DECISIONS") || decisions))));
  useEffect(() => {
    if (!ready) return;
    document.title = `${meeting!.meetingType.name} du ${meeting!.date}`;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready, meeting]);

  if (error || acc.error) return <p className="p-8 text-sm">Séance inaccessible.</p>;
  if (!ready) return <p className="p-8 text-sm text-muted">Préparation du compte rendu…</p>;
  const type = meeting.meetingType;
  const a = acc.data!.account;
  const st = type.settings ?? {};
  const acts = actions && series ? actionsForMeeting(actions, type, meeting, series) : [];
  const decs = decisions && series ? decisionsForMeeting(decisions, type, meeting, series) : { pending: [], taken: [] };
  const request = (txt: string) => (type.blocks.includes("DECISIONS") ? stripDecisions(txt) : txt);

  return (
    <main className="print-doc mx-auto max-w-[820px] bg-white px-8 py-8 text-[13px] leading-relaxed text-slate-800">
      <div className="no-print mb-6 flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Imprimer ou enregistrer en PDF
        </button>
        <button className="btn btn-sm" onClick={() => window.close()}>
          Fermer
        </button>
      </div>
      <header className="mb-6 border-b-2 pb-3" style={{ borderColor: "#004968" }}>
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#004968" }}>
          {a.clientName}, compte {a.name}
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold" style={{ color: "#004968" }}>
          {type.emoji} {type.name} du {longDate(meeting.date)}
        </h1>
      </header>

      {type.blocks.includes("HIGHLIGHTS") && (
        <section className="mb-6">
          <H2>Faits marquants</H2>
          {!meeting.highlights.length && <p className="text-slate-500">Aucun fait marquant.</p>}
          <div className="grid grid-cols-2 gap-3">
            {meeting.highlights.map((h) => {
              const t = h.typeId ? acc.opt.get(h.typeId) : null;
              const s = h.streamId ? acc.str.get(h.streamId) : null;
              return (
                <article key={h.id} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                  <div className="font-semibold" style={{ color: "#2563EB" }}>
                    {h.emoji} {h.title}
                  </div>
                  <div className="mb-1 text-[11px] font-semibold" style={{ color: "#D97706" }}>
                    {[t?.label, s ? `${s.emoji} ${s.name}` : ""].filter(Boolean).join(", ")}
                  </div>
                  <Markdown text={h.detail} className="text-[12px]" />
                </article>
              );
            })}
          </div>
        </section>
      )}

      {type.blocks.includes("STREAM_STATUS") && (
        <section className="mb-6">
          <H2>{st.statusLabel || "Statut des streams"}</H2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-white" style={{ background: "#004968" }}>
                <th className="p-2">Stream</th>
                <th className="p-2">Statut</th>
                <th className="p-2">{st.progressLabel || "Avancement"}</th>
                <th className="p-2">{st.alertsLabel || "Alertes"}</th>
              </tr>
            </thead>
            <tbody>
              {meeting.statuses
                .filter((r) => r.streamId || r.progress.trim() || r.alerts.trim())
                .map((r) => {
                  const s = r.streamId ? acc.str.get(r.streamId) : null;
                  return (
                    <tr key={r.id} className="break-inside-avoid border-b border-slate-200 align-top">
                      <td className="whitespace-nowrap p-2 font-semibold">{s ? `${s.emoji} ${s.name}` : "Sans stream"}</td>
                      <td className="p-2">
                        {r.statusIds.map((sid) => {
                          const o = acc.opt.get(sid);
                          return o ? (
                            <div key={sid} className="whitespace-nowrap">
                              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: tone[o.color] }} />
                              {o.label}
                            </div>
                          ) : null;
                        })}
                      </td>
                      <td className="p-2">
                        <Markdown text={r.progress} />
                      </td>
                      <td className="p-2">
                        <Markdown text={r.alerts} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      )}

      {type.blocks.includes("TOPICS") && (
        <section className="mb-6">
          <H2>Sujets</H2>
          {!meeting.topics.length && <p className="text-slate-500">Aucun sujet.</p>}
          <ol className="space-y-3">
            {meeting.topics.map((t, i) => {
              const tags = [t.themeId ? acc.opt.get(t.themeId)?.label : "", t.natureId ? acc.opt.get(t.natureId)?.label : ""].filter(Boolean).join(", ");
              return (
                <li key={t.id} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                  <div className="font-semibold" style={{ color: "#004968" }}>
                    {i + 1}. {t.emoji} {t.title}
                    {tags && <span className="ml-2 text-[11px] font-normal text-slate-500">{tags}</span>}
                  </div>
                  <Markdown text={t.description} className="mt-1 text-[12px]" />
                  {request(t.decisionRequest).trim() && (
                    <div className="mt-2 rounded border-l-4 bg-amber-50 p-2 text-[12px]" style={{ borderColor: "#D97706" }}>
                      <div className="text-[11px] font-semibold uppercase" style={{ color: "#D97706" }}>
                        {st.decisionLabel || "Arbitrage demandé"}
                      </div>
                      <Markdown text={request(t.decisionRequest)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {type.blocks.includes("DECISIONS") && (decs.taken.length > 0 || decs.pending.length > 0) && (
        <section className="mb-6">
          <H2>Décisions</H2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-white" style={{ background: "#004968" }}>
                <th className="w-24 p-2">Statut</th>
                <th className="w-24 p-2">Date</th>
                <th className="p-2">Décision</th>
                <th className="p-2">Stream</th>
              </tr>
            </thead>
            <tbody>
              {[...decs.taken, ...decs.pending].map((d) => (
                <tr key={d.id} className="break-inside-avoid border-b border-slate-200 align-top">
                  <td className="p-2 font-semibold" style={{ color: d.status === "TAKEN" ? "#0F766E" : "#D97706" }}>
                    {d.status === "TAKEN" ? "Prise" : "Attendue"}
                  </td>
                  <td className="whitespace-nowrap p-2">{d.decidedOn ? `${d.status === "PENDING" ? "pour le " : ""}${frDate(d.decidedOn)}` : ""}</td>
                  <td className="p-2">
                    <div className="font-semibold">{d.title}</div>
                    {d.detail.trim() && <Markdown text={d.detail} />}
                  </td>
                  <td className="p-2">{d.streamId ? acc.str.get(d.streamId)?.name : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {type.blocks.includes("ACTIONS") && acts.length > 0 && (
        <section className="mb-6">
          <H2>Relevé des actions</H2>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-white" style={{ background: "#004968" }}>
                <th className="w-8 p-2">#</th>
                <th className="p-2">Porteur</th>
                <th className="p-2">Stream</th>
                <th className="p-2">Action</th>
                <th className="w-24 p-2">Échéance</th>
              </tr>
            </thead>
            <tbody>
              {acts.map((x, i) => (
                <tr key={x.id} className="break-inside-avoid border-b border-slate-200 align-top">
                  <td className="p-2 text-slate-500">{i + 1}</td>
                  <td className="p-2">
                    <div className="font-semibold">{partyLabel(x.party, acc)}</div>
                    {x.ownerId && <div className="text-[11px] text-slate-500">{acc.ctc.get(x.ownerId)?.name}</div>}
                  </td>
                  <td className="p-2">{x.streamId ? acc.str.get(x.streamId)?.name : ""}</td>
                  <td className={`p-2 ${x.status !== "OPEN" ? "text-slate-500 line-through" : ""}`}>
                    {x.title}
                    {x.status === "DONE" && <span className="ml-1 text-[11px] text-teal-700 no-underline">(fait)</span>}
                  </td>
                  <td className="whitespace-nowrap p-2">{x.dueDate ? frDate(x.dueDate) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-2 text-[10px] text-slate-500">Compte rendu édité depuis WacMan (Wifirst Account Management).</footer>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-display text-base font-bold uppercase tracking-wide" style={{ color: "#004968" }}>
      {children}
    </h2>
  );
}
