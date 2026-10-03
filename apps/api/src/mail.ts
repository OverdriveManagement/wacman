import { Resend } from "resend";
import { env } from "./env.js";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

/** Envoie le code de double authentification. Sans clé Resend (développement), le code est journalisé. */
export async function sendLoginCode(to: string, name: string, code: string, log: (msg: string) => void) {
  if (!resend) {
    log(`[dev] Code de connexion pour ${to} : ${code}`);
    return;
  }
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1E293B">
    <div style="font-size:20px;font-weight:700;color:#004968;margin-bottom:16px">WacMan</div>
    <p>Bonjour ${escapeHtml(name)},</p>
    <p>Voici votre code de connexion à WacMan :</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#004968;background:#F1F5F9;border-radius:8px;padding:16px;text-align:center">${code}</div>
    <p style="color:#64748B;font-size:13px">Ce code est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
  </div>`;
  const { error } = await resend.emails.send({
    from: env.mailFrom,
    to,
    subject: `Votre code de connexion WacMan : ${code}`,
    html,
    text: `Bonjour ${name},\n\nVotre code de connexion à WacMan : ${code}\nIl est valable 10 minutes.`,
  });
  if (error) throw new Error(`Envoi du code impossible : ${error.message}`);
}

/** Envoie le code de réinitialisation du mot de passe. */
export async function sendResetCode(to: string, name: string, code: string, log: (msg: string) => void) {
  if (!resend) {
    log(`[dev] Code de réinitialisation pour ${to} : ${code}`);
    return;
  }
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1E293B">
    <div style="font-size:20px;font-weight:700;color:#004968;margin-bottom:16px">WacMan</div>
    <p>Bonjour ${escapeHtml(name)},</p>
    <p>Voici votre code pour choisir un nouveau mot de passe WacMan :</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#004968;background:#F1F5F9;border-radius:8px;padding:16px;text-align:center">${code}</div>
    <p style="color:#64748B;font-size:13px">Ce code est valable 10 minutes. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.</p>
  </div>`;
  const { error } = await resend.emails.send({
    from: env.mailFrom,
    to,
    subject: `Réinitialisation de votre mot de passe WacMan : ${code}`,
    html,
    text: `Bonjour ${name},\n\nVotre code pour choisir un nouveau mot de passe WacMan : ${code}\nIl est valable 10 minutes. Si vous n'avez rien demandé, ignorez ce message.`,
  });
  if (error) throw new Error(`Envoi du code impossible : ${error.message}`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
