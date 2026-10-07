import { Resend } from "resend";
import { Bridge, markupToPlain } from "@wacman/core";
import { env } from "../env.js";

/**
 * E-mails de WiBridge (Resend, même clé que WacMan, expéditeur propre) : codes de connexion,
 * invitations, avis d'accès, notifications d'attribution et récapitulatif quotidien.
 * Sans clé Resend (développement), les messages sont gardés en mémoire et lisibles par les tests.
 */

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Boîte d'envoi de développement (jamais utilisée en production) ; `n` numérote les e-mails pour lire la suite d'un point donné. */
export const devOutbox: (Mail & { at: string; n: number })[] = [];
let devSeq = 0;

export async function deliver(mails: Mail[], log: (m: string) => void = console.log) {
  if (!mails.length) return;
  if (!resend) {
    if (env.isProd) throw new Error("Service d'e-mail non configuré (RESEND_API_KEY).");
    for (const m of mails) {
      devOutbox.push({ ...m, at: new Date().toISOString(), n: ++devSeq });
      log(`[dev] e-mail WiBridge pour ${m.to} : ${m.subject}`);
    }
    devOutbox.splice(0, Math.max(0, devOutbox.length - 1000));
    return;
  }
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100).map((m) => ({ from: env.bridgeMailFrom, to: m.to, subject: m.subject, html: m.html, text: m.text }));
    const { error } = chunk.length === 1 ? await resend.emails.send(chunk[0]) : await resend.batch.send(chunk);
    if (error) throw new Error(`Envoi d'e-mail impossible : ${error.message}`);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const PETROL = "#004968";
const BLUE = "#2563EB";
const OCRE = "#D97706";

function layout(title: string, inner: string, footer = "Vous recevez ce message parce que vous avez un accès à WiBridge.") {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F1F5F9">
<div style="background:#F1F5F9;padding:24px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1E293B">
  <div style="max-width:580px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">
    <div style="background:${PETROL};padding:14px 24px;color:#FFFFFF">
      <span style="font-size:18px;font-weight:700;letter-spacing:-0.01em">WiBridge</span>
      <span style="font-size:12px;opacity:.75;margin-left:8px">Espace d'échange Wifirst</span>
    </div>
    <div style="padding:24px">
      <div style="font-size:17px;font-weight:700;color:${PETROL};margin:0 0 14px">${esc(title)}</div>
      ${inner}
    </div>
    <div style="padding:12px 24px;background:#F8FAFC;color:#64748B;font-size:12px;border-top:1px solid #E2E8F0">${esc(footer)}</div>
  </div>
</div></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55">${s}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:18px 0"><a href="${esc(href)}" style="display:inline-block;background:${BLUE};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${esc(label)}</a></p>`;
const codeBox = (code: string) =>
  `<div style="font-size:32px;font-weight:700;letter-spacing:8px;color:${PETROL};background:#F1F5F9;border-radius:8px;padding:16px;text-align:center;margin:8px 0 14px">${code}</div>`;
const small = (s: string) => `<p style="margin:12px 0 0;font-size:12px;color:#64748B;line-height:1.5">${s}</p>`;
const partyColor = (party: Bridge.Party) => (party === "PROVIDER" ? BLUE : OCRE);

export function loginCodeMail(to: string, name: string, code: string): Mail {
  return {
    to,
    subject: `Votre code de connexion WiBridge : ${code}`,
    html: layout(
      "Code de connexion",
      p(`Bonjour ${esc(name)},`) + p("Voici votre code pour vous connecter à WiBridge depuis un nouvel appareil :") + codeBox(code) + small("Ce code est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message et changez votre mot de passe."),
    ),
    text: `Bonjour ${name},\n\nVotre code de connexion à WiBridge depuis un nouvel appareil : ${code}\nIl est valable 10 minutes.`,
  };
}

export function resetCodeMail(to: string, name: string, code: string): Mail {
  return {
    to,
    subject: `Réinitialisation de votre mot de passe WiBridge : ${code}`,
    html: layout(
      "Nouveau mot de passe",
      p(`Bonjour ${esc(name)},`) + p("Voici votre code pour choisir un nouveau mot de passe WiBridge :") + codeBox(code) + small("Ce code est valable 10 minutes. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable."),
    ),
    text: `Bonjour ${name},\n\nVotre code pour choisir un nouveau mot de passe WiBridge : ${code}\nIl est valable 10 minutes.`,
  };
}

/** Mot de passe oublié demandé pour une adresse sans compte WiBridge actif : l'e-mail explique comment obtenir un accès. */
export function noAccessMail(to: string): Mail {
  const lead = `Un nouveau mot de passe WiBridge a été demandé pour l'adresse ${to}, mais aucun compte WiBridge actif n'est ouvert pour cette adresse.`;
  const how = "L'accès à WiBridge se fait sur invitation : demandez-la à votre contact chez Wifirst. Vous recevrez alors un e-mail pour créer votre mot de passe.";
  return {
    to,
    subject: "WiBridge : demande de nouveau mot de passe",
    html: layout(
      "Pas de compte WiBridge",
      p("Bonjour,") + p(esc(lead)) + p(esc(how)) + small("Si vous n'êtes pas à l'origine de cette demande, ignorez ce message."),
      "Vous recevez ce message à la suite d'une demande faite sur la page de connexion de WiBridge.",
    ),
    text: `Bonjour,\n\n${lead}\n${how}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n`,
  };
}

const clientList = (clients: { name: string }[]) => (clients.length ? clients.map((c) => c.name).join(", ") : "");

/** Rappel des notifications, désactivées par défaut. */
const NOTIFY_NOTE =
  "Par défaut, WiBridge ne vous envoie pas d'e-mail quand une question attend votre réponse : vous pouvez choisir un e-mail à chaque attribution ou un récapitulatif quotidien dans Mon compte (menu en haut à droite).";

export function invitationMail(to: string, name: string, inviter: string, clients: { name: string; clientName: string }[], link: string, expiresAt: Date): Mail {
  const space = clientList(clients);
  const until = expiresAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
  const partner = clients[0]?.clientName ?? "ses clients";
  return {
    to,
    subject: "Invitation à WiBridge (Wifirst)",
    html: layout(
      "Créez votre compte WiBridge",
      p(`Bonjour ${esc(name)},`) +
        p(`${esc(inviter)} vous invite à rejoindre <b>WiBridge</b>, l'espace où Wifirst et ${esc(partner)} échangent leurs questions et leurs demandes d'éléments${space ? ` (${esc(space)})` : ""}.`) +
        p("Cliquez sur le bouton ci-dessous pour choisir votre mot de passe et activer votre compte :") +
        button(link, "Créer mon compte") +
        small(`Ce lien est personnel et valable jusqu'au ${until}. Ensuite, la connexion se fait avec votre adresse e-mail et votre mot de passe ; un code vous est envoyé par e-mail à la première connexion depuis un nouvel appareil.`) +
        small(NOTIFY_NOTE),
      "Si vous ne vous attendiez pas à cette invitation, vous pouvez ignorer ce message.",
    ),
    text: `Bonjour ${name},\n\n${inviter} vous invite à rejoindre WiBridge, l'espace où Wifirst et ${partner} échangent leurs questions${space ? ` (${space})` : ""}.\n\nCréez votre compte (choix du mot de passe) avec ce lien personnel, valable jusqu'au ${until} :\n${link}\n\n${NOTIFY_NOTE}\n`,
  };
}

export function accessMail(to: string, name: string, inviter: string, clients: { name: string; clientName: string }[], loginUrl: string): Mail {
  const space = clientList(clients);
  return {
    to,
    subject: "Votre accès à WiBridge (Wifirst)",
    html: layout(
      "Accès à WiBridge",
      p(`Bonjour ${esc(name)},`) +
        p(`${esc(inviter)} vous a ouvert l'accès à <b>WiBridge</b>, l'espace d'échange de questions entre Wifirst et ses clients${space ? ` (${esc(space)})` : ""}.`) +
        p("Connectez-vous avec votre adresse e-mail et votre mot de passe habituel (le même que pour WacMan). Un code vous sera envoyé par e-mail à la première connexion depuis un nouvel appareil.") +
        button(loginUrl, "Ouvrir WiBridge") +
        small(NOTIFY_NOTE),
    ),
    text: `Bonjour ${name},\n\n${inviter} vous a ouvert l'accès à WiBridge${space ? ` (${space})` : ""}.\nConnectez-vous avec votre adresse e-mail et votre mot de passe habituel (le même que pour WacMan) : ${loginUrl}\n\n${NOTIFY_NOTE}\n`,
  };
}

type NoticeData = NonNullable<Awaited<ReturnType<typeof Bridge.noticeRecipients>>>;

function questionCard(d: NoticeData, link: string, message?: { who: string; party: Bridge.Party; text: string }) {
  const q = d.question;
  const label = (x: Bridge.Party) => Bridge.partyLabel(d.client, x);
  const streams = d.streams.map((s) => `${s.emoji ? `${s.emoji} ` : ""}${s.name}`).join(", ");
  const body = Bridge.excerpt(q.body, 400);
  const msg = message?.text ? Bridge.excerpt(message.text, 500) : "";
  return `<div style="border:1px solid #E2E8F0;border-left:4px solid ${partyColor(q.assignedParty)};border-radius:8px;padding:12px 14px;margin:6px 0 4px">
  <div style="font-size:12px;color:#64748B;margin-bottom:4px">n°${q.ref}${streams ? `, ${esc(streams)}` : ""}</div>
  <div style="font-size:15px;font-weight:700;color:#0F172A">${esc(q.subject)}</div>
  ${body ? `<div style="font-size:13px;color:#334155;margin-top:6px;line-height:1.5">${esc(body)}</div>` : ""}
  <div style="font-size:12px;color:#64748B;margin-top:8px">Posée par ${esc(q.askedByName)} (${esc(label(q.askedByParty))})${q.status === "CLOSED" ? ", clôturée" : `, attribuée à <b style="color:${partyColor(q.assignedParty)}">${esc(label(q.assignedParty))}</b>`}${q.dueDate ? `, échéance ${q.dueDate.split("-").reverse().join("/")}` : ""}</div>
</div>
${msg && message ? `<div style="background:#F8FAFC;border-radius:8px;padding:10px 14px;margin:10px 0 0;font-size:13px;line-height:1.5;color:#334155"><div style="font-size:12px;color:#64748B;margin-bottom:4px">Message de ${esc(message.who)} (${esc(label(message.party))})</div>${esc(msg)}</div>` : ""}
${button(link, "Ouvrir la question")}`;
}

/** E-mails d'un événement, un par destinataire. */
export function noticeMails(n: Bridge.BridgeNotice, d: NoticeData): Mail[] {
  const q = d.question;
  const label = (x: Bridge.Party) => Bridge.partyLabel(d.client, x);
  const link = `${env.bridgeWebUrl}/c/${d.client.slug}?q=${q.ref}`;
  const actor = `${n.actor.name} (${label(n.actor.party)})`;
  const subj = Bridge.excerpt(q.subject, 90);
  const message = n.message?.trim() ? { who: n.actor.name, party: n.actor.party, text: markupToPlain(n.message) } : undefined;
  let subject: string;
  let lead: string;
  if (n.kind === "assigned") {
    subject = `WiBridge ${d.client.name} : question n°${q.ref} à traiter par ${label(n.party)}, ${subj}`;
    lead =
      n.reason === "created"
        ? `Nouvelle question de ${actor}, attribuée à ${label(n.party)}.`
        : n.reason === "reopened"
          ? `${actor} a rouvert cette question et l'attribue à ${label(n.party)}.`
          : n.reason === "reassigned"
            ? `${n.actor.name} a attribué cette question à ${label(n.party)}.`
            : `${actor} a écrit un message : la question est attribuée à ${label(n.party)}.`;
  } else if (n.kind === "closed") {
    subject = `WiBridge ${d.client.name} : question n°${q.ref} clôturée, ${subj}`;
    lead = `Votre question a été clôturée par ${actor}.`;
  } else {
    subject = `WiBridge ${d.client.name} : premiers éléments sur la question n°${q.ref}, ${subj}`;
    lead = `${actor} a apporté des premiers éléments sur votre question ; la réponse reste à compléter.`;
  }
  return d.recipients.map((r) => ({
    to: r.email,
    subject,
    html: layout(`Question n°${q.ref}`, p(`Bonjour ${esc(r.name)},`) + p(esc(lead)) + questionCard(d, link, message), "Vous recevez ce message selon vos préférences de notification (WiBridge, Mon compte)."),
    text: `Bonjour ${r.name},\n\n${lead}\n\nn°${q.ref} : ${q.subject}\n${Bridge.excerpt(q.body, 400)}\n${message ? `\nMessage de ${message.who} : ${Bridge.excerpt(message.text, 500)}\n` : ""}\nOuvrir la question : ${link}\n`,
  }));
}

export function digestMail(b: Awaited<ReturnType<typeof Bridge.digestBatches>>[number]): Mail {
  const c = b.client;
  const label = (x: Bridge.Party) => Bridge.partyLabel(c, x);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const n = b.questions.length;
  const rows = b.questions
    .slice(0, 40)
    .map((q) => {
      const late = q.dueDate && q.dueDate < today;
      return `<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B;white-space:nowrap;vertical-align:top">n°${q.ref}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:13px;vertical-align:top"><a href="${esc(`${env.bridgeWebUrl}/c/${c.slug}?q=${q.ref}`)}" style="color:#0F172A;font-weight:600;text-decoration:none">${esc(q.subject)}</a>
  <div style="font-size:12px;color:#64748B">${q.status === "IN_PROGRESS" ? "En cours" : "À traiter"}, ${esc(label(q.assignedParty))}</div></td>
  <td style="padding:8px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;white-space:nowrap;vertical-align:top;${late ? "color:#EF4444;font-weight:700" : "color:#64748B"}">${q.dueDate ? q.dueDate.split("-").reverse().join("/") : ""}</td>
</tr>`;
    })
    .join("");
  const more = n > 40 ? small(`Et ${n - 40} autres questions dans WiBridge.`) : "";
  return {
    to: b.recipient.email,
    subject: `WiBridge ${c.name} : ${n} question${n > 1 ? "s" : ""} à traiter`,
    html: layout(
      "Récapitulatif du jour",
      p(`Bonjour ${esc(b.recipient.name)},`) +
        p(`${n} question${n > 1 ? "s" : ""} ouverte${n > 1 ? "s" : ""} attend${n > 1 ? "ent" : ""} une réponse de votre organisation :`) +
        `<table style="width:100%;border-collapse:collapse;margin:4px 0 6px"><thead><tr><th style="text-align:left;font-size:11px;color:#64748B;padding:6px 10px;border-bottom:2px solid ${PETROL}">Réf.</th><th style="text-align:left;font-size:11px;color:#64748B;padding:6px 10px;border-bottom:2px solid ${PETROL}">Question</th><th style="text-align:left;font-size:11px;color:#64748B;padding:6px 10px;border-bottom:2px solid ${PETROL}">Échéance</th></tr></thead><tbody>${rows}</tbody></table>` +
        more +
        button(`${env.bridgeWebUrl}/c/${c.slug}`, "Ouvrir WiBridge"),
      "Récapitulatif quotidien choisi dans WiBridge, Mon compte. Vous pouvez passer aux e-mails à chaque attribution ou les désactiver.",
    ),
    text: `Bonjour ${b.recipient.name},\n\n${n} question(s) attendent une réponse de votre organisation :\n${b.questions
      .slice(0, 40)
      .map((q) => `- n°${q.ref} ${q.subject}${q.dueDate ? ` (échéance ${q.dueDate.split("-").reverse().join("/")})` : ""}`)
      .join("\n")}\n\n${env.bridgeWebUrl}/c/${c.slug}\n`,
  };
}

/** Envoi des notifications d'un événement (appelé par le service métier, sans bloquer la requête). */
export async function sendNotice(n: Bridge.BridgeNotice) {
  const d = await Bridge.noticeRecipients(n);
  if (!d || !d.recipients.length) return;
  await deliver(noticeMails(n, d));
}
