"use client";

import { useMemo } from "react";
import { frDate, isOverdue, tone } from "@/lib/format";
import type { Card } from "@/lib/types";
import { useAcc } from "./AccountContext";
import { Markdown } from "./Markdown";
import { Empty, Pill, Spinner } from "./ui";

/** Cartes non terminées en vigilance ou en alerte, de la plus grave à la moins grave ; un clic ouvre la carte. */
export function AlertCards({ cards, onOpen }: { cards?: Card[]; onOpen: (c: Card) => void }) {
  const acc = useAcc();
  const list = useMemo(
    () =>
      (cards ?? [])
        .filter((c) => c.alertLevelId && !acc.isDone(c.statusId))
        .sort(
          (a, b) =>
            (acc.opt.get(b.alertLevelId!)?.order ?? 0) - (acc.opt.get(a.alertLevelId!)?.order ?? 0) ||
            (acc.str.get(a.streamId ?? "")?.order ?? 0) - (acc.str.get(b.streamId ?? "")?.order ?? 0),
        ),
    [cards, acc],
  );
  if (!cards) return <Spinner />;
  if (!list.length) return <Empty>Aucune carte en vigilance ou en alerte.</Empty>;
  return (
    <>
      <div className="table-wrap hidden md:block">
        <table className="data">
          <thead>
            <tr>
              <th className="w-[26%]">Livrable</th>
              <th>Niveau</th>
              <th>Stream</th>
              <th>Porteur</th>
              <th>Échéance</th>
              <th className="w-[38%]">Alertes / arbitrages</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const lvl = acc.opt.get(c.alertLevelId!);
              const s = c.streamId ? acc.str.get(c.streamId) : null;
              return (
                <tr key={c.id} className="cursor-pointer" onClick={() => onOpen(c)} style={{ boxShadow: `inset 3px 0 0 ${tone[lvl?.color ?? "slate"]}` }}>
                  <td className="font-semibold text-ink">
                    {c.emoji && <span className="mr-1">{c.emoji}</span>}
                    {c.title}
                  </td>
                  <td>
                    <Pill option={lvl} small />
                  </td>
                  <td className="whitespace-nowrap">{s ? `${s.emoji} ${s.name}` : ""}</td>
                  <td className="whitespace-nowrap">{c.ownerId ? acc.ctc.get(c.ownerId)?.name : ""}</td>
                  <td className={`whitespace-nowrap ${isOverdue(c.dueDate) ? "font-semibold text-red" : ""}`}>{frDate(c.dueDate)}</td>
                  <td>
                    <Markdown text={c.alertsNote} className="line-clamp-4 text-[0.82rem]" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {list.map((c) => {
          const lvl = acc.opt.get(c.alertLevelId!);
          return (
            <button key={c.id} onClick={() => onOpen(c)} className="card block w-full p-3 text-left" style={{ borderLeft: `3px solid ${tone[lvl?.color ?? "slate"]}` }}>
              <div className="flex items-start gap-2">
                <span className="flex-1 font-semibold text-ink">{c.title}</span>
                <Pill option={lvl} small />
              </div>
              <div className="mt-1 text-xs text-muted">
                {[c.streamId ? acc.str.get(c.streamId)?.name : "", c.ownerId ? acc.ctc.get(c.ownerId)?.name : "", c.dueDate ? `échéance ${frDate(c.dueDate)}` : ""].filter(Boolean).join(", ")}
              </div>
              <Markdown text={c.alertsNote} className="mt-1 line-clamp-3 text-sm text-ink-2" />
            </button>
          );
        })}
      </div>
    </>
  );
}
