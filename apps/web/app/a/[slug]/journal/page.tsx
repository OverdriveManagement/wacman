"use client";

import useSWR from "swr";
import { useState } from "react";
import { fetcher } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { Empty, SectionTitle, Spinner } from "@/components/ui";

const TYPES: Record<string, string> = {
  "": "Tous les éléments",
  card: "Cartes",
  meeting: "Séances",
  highlight: "Faits marquants",
  streamStatus: "Statuts de streams",
  topic: "Sujets",
  risk: "Risques et arbitrages",
  stream: "Streams",
  sprint: "Sprints",
  option: "Listes de valeurs",
  meetingType: "Types de séance",
  governance: "Comitologie",
  contact: "Contacts",
  account: "Compte",
  membership: "Accès",
};

export default function JournalPage() {
  const acc = useAcc();
  const [type, setType] = useState("");
  const { data } = useSWR<AuditEntry[]>(`${acc.base}/audit?limit=300${type ? `&entityType=${type}` : ""}`, fetcher);
  return (
    <div className="space-y-4">
      <SectionTitle icon="🕘" actions={
        <select className="input !w-auto" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      }>
        Journal des modifications
      </SectionTitle>
      {!data ? (
        <Spinner />
      ) : !data.length ? (
        <Empty>Aucune modification.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data min-w-[640px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Par</th>
                <th>Élément</th>
                <th className="w-[55%]">Modification</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{dateTime(e.createdAt)}</td>
                  <td className="whitespace-nowrap">
                    {e.userName}
                    {e.viaAssistant && <span className="ml-1 rounded bg-surface-3 px-1.5 py-0.5 text-[0.65rem] text-accent">assistant</span>}
                  </td>
                  <td className="whitespace-nowrap">{TYPES[e.entityType] ?? e.entityType}</td>
                  <td>{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
