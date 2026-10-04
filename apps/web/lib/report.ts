import { longDate } from "./format";
import { markupToPlain } from "./markup";
import type { AccountCtx } from "./hooks";
import type { Meeting, MeetingType } from "./types";

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
export function meetingReportText(meeting: Meeting, type: MeetingType, acc: AccountCtx): string {
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
      if (t.decisionRequest.trim()) out.push(`   ${type.settings?.decisionLabel || "Arbitrage demandé"} :\n${indent(t.decisionRequest, "     ")}`);
    });
    out.push("");
  }

  if (meeting.notes?.trim()) {
    out.push("NOTES");
    out.push(plainText(meeting.notes));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
