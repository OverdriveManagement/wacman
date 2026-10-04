import { frDate, longDate } from "./format";
import { markupToPlain } from "./markup";
import type { AccountCtx } from "./hooks";
import type { Action, Decision, Meeting, MeetingType } from "./types";
import { partyLabel, stripDecisions } from "./followup";

/** Texte brut (sans balisage) d'un contenu saisi : mise en forme retirée, liens écrits en clair, cases lisibles. */
export function plainText(s: string | null | undefined): string {
  return markupToPlain(s).trim();
}

const indent = (s: string, pad = "  ") =>
  plainText(s)
    .split("\n")
    .map((l) => (l.trim() ? pad + l.replace(/^\s*[•*]\s+/, "- ") : ""))
    .join("\n");

/**
 * Compte rendu d'une séance au format texte, prêt à coller dans un e-mail.
 * Rédaction sobre : pas de tiret cadratin, pas de flèche, pas de point médian.
 */
export function meetingReportText(meeting: Meeting, type: MeetingType, acc: AccountCtx, opts: { actions?: Action[]; decisions?: { pending: Decision[]; taken: Decision[] } } = {}): string {
  const a = acc.data!.account;
  const out: string[] = [];
  out.push(`${type.name} du ${longDate(meeting.date)}`);
  out.push(`${a.clientName}, compte ${a.name}`);
  out.push("");

  if (type.blocks.includes("HIGHLIGHTS")) {
    out.push("FAITS MARQUANTS");
    if (!meeting.highlights.length) out.push("Aucun fait marquant.");
    for (const h of meeting.highlights) {
      const t = h.typeId ? acc.opt.get(h.typeId)?.label : "";
      const s = h.streamId ? acc.str.get(h.streamId)?.name : "";
      out.push(`- ${plainText(h.title)}${[t, s].filter(Boolean).length ? ` (${[t, s].filter(Boolean).join(", ")})` : ""}`);
      if (h.detail.trim()) out.push(indent(h.detail, "    "));
    }
    out.push("");
  }

  if (type.blocks.includes("STREAM_STATUS")) {
    const st = type.settings ?? {};
    out.push((st.statusLabel || "STATUT DES STREAMS").toUpperCase());
    const rows = meeting.statuses.filter((r) => r.streamId || r.progress.trim() || r.alerts.trim());
    if (!rows.length) out.push("Aucun statut renseigné.");
    for (const r of rows) {
      const s = r.streamId ? acc.str.get(r.streamId) : null;
      const labels = r.statusIds.map((id) => acc.opt.get(id)?.label).filter(Boolean).join(", ");
      out.push(`${s ? s.name : "Sans stream"}${labels ? ` : ${labels}` : ""}`);
      if (r.progress.trim()) out.push(`  ${st.progressLabel || "Avancement"} :\n${indent(r.progress, "    ")}`);
      if (r.alerts.trim()) out.push(`  ${st.alertsLabel || "Alertes"} :\n${indent(r.alerts, "    ")}`);
    }
    out.push("");
  }

  if (type.blocks.includes("TOPICS")) {
    out.push("SUJETS");
    if (!meeting.topics.length) out.push("Aucun sujet.");
    meeting.topics.forEach((t, i) => {
      const tags = [t.themeId ? acc.opt.get(t.themeId)?.label : "", t.natureId ? acc.opt.get(t.natureId)?.label : ""].filter(Boolean).join(", ");
      out.push(`${i + 1}. ${plainText(t.title)}${tags ? ` (${tags})` : ""}`);
      if (t.description.trim()) out.push(indent(t.description, "   "));
      const req = type.blocks.includes("DECISIONS") ? stripDecisions(t.decisionRequest) : t.decisionRequest;
      if (req.trim()) out.push(`   ${type.settings?.decisionLabel || "Arbitrage demandé"} :\n${indent(req, "     ")}`);
    });
    out.push("");
  }

  if (type.blocks.includes("DECISIONS") && opts.decisions && (opts.decisions.taken.length || opts.decisions.pending.length)) {
    out.push("DÉCISIONS");
    for (const d of opts.decisions.taken) {
      out.push(`- ${d.decidedOn ? frDate(d.decidedOn) + " : " : ""}${plainText(d.title)}`);
      if (d.detail.trim()) out.push(indent(d.detail, "    "));
    }
    if (opts.decisions.pending.length) {
      out.push("Décisions attendues :");
      for (const d of opts.decisions.pending) out.push(`- ${plainText(d.title)}${d.decidedOn ? ` (pour le ${frDate(d.decidedOn)})` : ""}`);
    }
    out.push("");
  }

  if (type.blocks.includes("ACTIONS") && opts.actions?.length) {
    out.push("RELEVÉ DES ACTIONS");
    opts.actions.forEach((x, i) => {
      const stream = x.streamId ? acc.str.get(x.streamId)?.name : "";
      const state = x.status === "DONE" ? " (fait)" : x.status === "CANCELLED" ? " (abandonnée)" : "";
      out.push(`${i + 1}. [${partyLabel(x.party, acc)}${stream ? `, ${stream}` : ""}] ${plainText(x.title)}${x.dueDate ? ` (échéance ${frDate(x.dueDate)})` : ""}${state}`);
    });
    out.push("");
  }

  if (meeting.notes?.trim()) {
    out.push("NOTES");
    out.push(plainText(meeting.notes));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
