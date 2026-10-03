"use client";

import { api, toast } from "@/lib/api";
import { frDate } from "@/lib/format";
import type { GovernanceBody, Sprint } from "@/lib/types";
import { useAcc } from "@/components/AccountContext";
import { Callout, InlineText, SectionTitle, useConfirm } from "@/components/ui";
import { IconDown, IconPlus, IconTrash, IconUp } from "@/components/icons";

const STATE: Record<Sprint["state"], { label: string; color: string }> = {
  CURRENT: { label: "▶️ En cours", color: "var(--accent)" },
  UPCOMING: { label: "⏳ À venir", color: "var(--muted)" },
  DONE: { label: "✅ Terminé", color: "var(--teal)" },
};

export default function GovernancePage() {
  const acc = useAcc();
  const s = acc.data.account.settings;
  const confirm = useConfirm();
  const reload = () => acc.mutate();
  const admin = acc.isAdmin;

  const patch = async (entity: string, id: string, data: unknown) => {
    await api(`${acc.base}/e/${entity}/${id}`, { method: "PATCH", json: data });
    reload();
  };

  const govTable = (scope: "INTERNAL" | "JOINT") => {
    const rows = acc.data.governance.filter((g) => g.scope === scope).sort((a, b) => a.order - b.order);
    const supportLabel = scope === "INTERNAL" ? s.governanceInternalSupportLabel : s.governanceJointSupportLabel;
    const color = scope === "INTERNAL" ? "var(--petrol)" : "color-mix(in srgb, var(--ocre) 70%, black)";
    const move = async (i: number, dir: -1 | 1) => {
      const j = i + dir;
      if (j < 0 || j >= rows.length) return;
      const ids = rows.map((r) => r.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api(`${acc.base}/e/governance/reorder`, { method: "POST", json: { ids } });
      reload();
    };
    const cellEdit = (g: GovernanceBody, field: keyof GovernanceBody, cls = "") => (
      <InlineText multiline disabled={!admin} value={String(g[field] ?? "")} onSave={(v) => patch("governance", g.id, { [field]: v })} className={cls} />
    );
    return (
      <div className="space-y-2">
        <div className="table-wrap">
          <table className="data min-w-[860px]">
            <thead>
              <tr>
                {["Instance", "Finalité", "Participants", "Fréquence", supportLabel].map((h) => (
                  <th key={h} style={{ background: color, color: "#fff" }}>
                    {h}
                  </th>
                ))}
                {admin && <th style={{ background: color }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((g, i) => (
                <tr key={g.id}>
                  <td className="w-[20%] font-semibold text-ink">{cellEdit(g, "name", "font-semibold")}</td>
                  <td className="w-[32%]">{cellEdit(g, "purpose")}</td>
                  <td className="w-[22%]">{cellEdit(g, "participants")}</td>
                  <td className="w-[12%]">{cellEdit(g, "frequency")}</td>
                  <td className="w-[12%]">{cellEdit(g, "support")}</td>
                  {admin && (
                    <td className="whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Monter" onClick={() => move(i, -1)}>
                        <IconUp width={14} height={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm !px-1.5" aria-label="Descendre" onClick={() => move(i, 1)}>
                        <IconDown width={14} height={14} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-danger !px-1.5"
                        aria-label="Supprimer"
                        onClick={() =>
                          confirm.ask("Supprimer l'instance", `« ${g.name} » sera retirée de la comitologie.`, async () => {
                            await api(`${acc.base}/e/governance/${g.id}`, { method: "DELETE" });
                            reload();
                          })
                        }
                      >
                        <IconTrash width={14} height={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {admin && (
          <button
            className="btn btn-sm"
            onClick={async () => {
              await api(`${acc.base}/e/governance`, { method: "POST", json: { scope, name: "Nouvelle instance", order: rows.length + 1 } });
              reload();
            }}
          >
            <IconPlus /> Ajouter une instance
          </button>
        )}
      </div>
    );
  };

  const directory = acc.data.streams.filter((x) => x.inDirectory && x.active).sort((a, b) => a.order - b.order);
  const sprints = [...acc.data.sprints].sort((a, b) => a.order - b.order);
  const current = sprints.find((x) => x.state === "CURRENT");
  const next = current ? sprints.find((x) => x.order > current.order && x.state !== "DONE") : sprints.find((x) => x.state === "UPCOMING");

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <SectionTitle icon="🏛️">Comitologie</SectionTitle>
        <Callout text={s.governanceIntro} />
        <h3 className="font-display text-base font-bold text-heading">{s.governanceInternalTitle}</h3>
        {govTable("INTERNAL")}
        <h3 className="pt-2 font-display text-base font-bold text-ocre">{s.governanceJointTitle}</h3>
        {govTable("JOINT")}
      </section>

      <section>
        <SectionTitle icon="👥">Streams et interlocuteurs</SectionTitle>
        <div className="table-wrap">
          <table className="data min-w-[640px]">
            <thead>
              <tr>
                <th className="w-[34%]">Stream</th>
                <th>{s.labels.leader}</th>
                <th>{s.labels.prescriber}</th>
              </tr>
            </thead>
            <tbody>
              {directory.map((st) => (
                <tr key={st.id}>
                  <td className="font-semibold text-ink">
                    {st.emoji} {st.name}
                  </td>
                  <td>
                    <InlineText disabled={!admin} value={st.leader} onSave={(v) => patch("stream", st.id, { leader: v })} />
                  </td>
                  <td>
                    <InlineText disabled={!admin} value={st.prescriber} onSave={(v) => patch("stream", st.id, { prescriber: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Les streams affichés ici se règlent dans Paramètres du compte, rubrique Streams.</p>
      </section>

      <section className="space-y-4">
        <SectionTitle
          icon="🗓️"
          actions={
            admin &&
            current &&
            next && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() =>
                  confirm.ask(
                    "Basculer au sprint suivant",
                    `${current.name} passe à Terminé, ${next.name} à En cours, et les cartes non terminées de ${current.name} sont reportées dans ${next.name}.`,
                    async () => {
                      const r = await api<{ moved: number }>(`${acc.base}/sprints/switch`, { method: "POST", json: { fromSprintId: current.id, toSprintId: next.id } });
                      toast("success", `${r.moved} carte(s) reportée(s) dans ${next.name}.`);
                      reload();
                    },
                  )
                }
              >
                Basculer au sprint suivant
              </button>
            )
          }
        >
          Sprints
        </SectionTitle>
        <Callout text={s.sprintMethodology} />
        <div className="table-wrap">
          <table className="data min-w-[760px]">
            <thead>
              <tr>
                <th>Sprint</th>
                <th>Dates</th>
                <th>État</th>
                <th className="w-[38%]">Échéance {acc.data.account.clientName}</th>
                <th className="w-[26%]">Objectif</th>
              </tr>
            </thead>
            <tbody>
              {sprints.map((sp) => (
                <tr key={sp.id}>
                  <td className="font-semibold text-ink">{sp.name}</td>
                  <td className="whitespace-nowrap">
                    {frDate(sp.startDate)} au {frDate(sp.endDate)}
                  </td>
                  <td className="whitespace-nowrap">
                    {admin ? (
                      <select className="input !w-auto !py-1 text-xs" value={sp.state} onChange={(e) => patch("sprint", sp.id, { state: e.target.value })}>
                        {Object.entries(STATE).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: STATE[sp.state].color }}>{STATE[sp.state].label}</span>
                    )}
                  </td>
                  <td>
                    <InlineText multiline disabled={!admin} value={sp.clientMilestone} onSave={(v) => patch("sprint", sp.id, { clientMilestone: v })} />
                  </td>
                  <td>
                    <InlineText multiline disabled={!admin} value={sp.objective} onSave={(v) => patch("sprint", sp.id, { objective: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {confirm.node}
    </div>
  );
}
