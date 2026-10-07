import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { badRequest, forbidden, isUuid, notFound } from "../context.js";
import { bridgeEvent, partiesOf, type BridgeCtx } from "./common.js";
import { getQuestion } from "./questions.js";

/** Pièces jointes WiBridge : contenu stocké en base, 20 Mo au plus par fichier. */

export const BRIDGE_MAX_FILE = 20 * 1024 * 1024;
const MAX_PENDING = 30;
// fichiers exécutables ou scripts refusés (les autres types sont acceptés et toujours téléchargés comme pièce jointe)
const BLOCKED = /\.(exe|bat|cmd|com|scr|msi|msp|ps1|psm1|vbs|vbe|js|jse|mjs|wsf|wsh|jar|dll|sh|app|lnk|reg|hta|cpl|scf|pif|gadget|application|appref-ms)$/i;

export function cleanFileName(raw: string) {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const s = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s === "." || s === "..") return "fichier";
  if (s.length <= 180) return s;
  const dot = s.lastIndexOf(".");
  const ext = dot > 0 && s.length - dot <= 12 ? s.slice(dot) : "";
  return s.slice(0, 180 - ext.length) + ext;
}

const meta = {
  id: T.bridgeFiles.id,
  clientId: T.bridgeFiles.clientId,
  questionId: T.bridgeFiles.questionId,
  messageId: T.bridgeFiles.messageId,
  name: T.bridgeFiles.name,
  mime: T.bridgeFiles.mime,
  size: T.bridgeFiles.size,
  uploadedById: T.bridgeFiles.uploadedById,
  attachedAt: T.bridgeFiles.attachedAt,
  createdAt: T.bridgeFiles.createdAt,
};

/**
 * Dépose un fichier. Avec questionId (et messageId), il est rattaché aussitôt à la question ou au message ;
 * sinon il reste en attente (visible de son seul auteur) jusqu'à l'envoi de la question ou de la réponse.
 */
export async function uploadBridgeFile(ctx: BridgeCtx, input: { name: string; mime?: string; questionId?: string | null; messageId?: string | null }, data: Buffer) {
  const name = cleanFileName(input.name);
  if (!data.length) throw badRequest("Le fichier est vide.");
  if (data.length > BRIDGE_MAX_FILE) throw badRequest("Fichier trop volumineux : 20 Mo au plus.");
  if (BLOCKED.test(name)) throw badRequest("Ce type de fichier n'est pas accepté (programme ou script).");
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(input.mime ?? "") ? input.mime! : "application/octet-stream";
  // les pièces déposées puis abandonnées en cours de rédaction sont effacées au bout de 24 heures
  await db.delete(T.bridgeFiles).where(and(isNull(T.bridgeFiles.attachedAt), lt(T.bridgeFiles.createdAt, new Date(Date.now() - 24 * 3600_000))));
  if (input.questionId) {
    const q = await getQuestion(ctx, input.questionId);
    if (q.deletedAt) throw notFound("Question introuvable.");
    if (input.messageId) {
      const m = q.messages.find((x) => x.id === input.messageId);
      if (!m) throw notFound("Message introuvable.");
      if (!m.perms.edit) throw forbidden("Vous ne pouvez pas ajouter de pièce jointe à ce message.");
    } else if (!q.perms.edit) throw forbidden("Vous ne pouvez pas ajouter de pièce jointe à cette question.");
    const row = await db.transaction(async (tx) => {
      const [f] = await tx
        .insert(T.bridgeFiles)
        .values({ clientId: ctx.client.id, questionId: q.id, messageId: input.messageId ?? null, name, mime, size: data.length, data, uploadedById: ctx.user.id, uploadedByName: ctx.user.name, attachedAt: new Date() })
        .returning(meta);
      await tx.update(T.bridgeQuestions).set({ lastActivityAt: new Date() }).where(eq(T.bridgeQuestions.id, q.id));
      await bridgeEvent(ctx, q.id, "attach", `Pièce jointe ajoutée : ${name}`, { file: name }, null, tx);
      return f;
    });
    return { id: row.id, name: row.name, mime: row.mime, size: row.size, attached: true };
  }
  // dépôt pendant la rédaction : réservé à qui peut écrire dans au moins un stream
  if (!ctx.user.isSuperAdmin && !ctx.streams.some((s) => partiesOf(ctx.access(s.id)).length)) throw forbidden("Votre accès est en lecture seule.");
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(T.bridgeFiles)
    .where(and(eq(T.bridgeFiles.uploadedById, ctx.user.id), isNull(T.bridgeFiles.attachedAt)));
  if (n >= MAX_PENDING) throw badRequest("Trop de pièces jointes en attente : envoyez ou retirez celles déjà déposées.");
  const [f] = await db
    .insert(T.bridgeFiles)
    .values({ clientId: ctx.client.id, name, mime, size: data.length, data, uploadedById: ctx.user.id, uploadedByName: ctx.user.name })
    .returning(meta);
  return { id: f.id, name: f.name, mime: f.mime, size: f.size, attached: false };
}

async function fileMeta(ctx: BridgeCtx, fileId: string) {
  if (!isUuid(fileId)) throw notFound("Pièce jointe introuvable.");
  const [f] = await db
    .select(meta)
    .from(T.bridgeFiles)
    .where(and(eq(T.bridgeFiles.id, fileId), eq(T.bridgeFiles.clientId, ctx.client.id)));
  if (!f) throw notFound("Pièce jointe introuvable.");
  return f;
}

/** Vérifie que l'utilisateur peut lire la pièce jointe (question visible, ou pièce en attente qu'il a déposée). */
export async function checkBridgeFileAccess(ctx: BridgeCtx, fileId: string) {
  const f = await fileMeta(ctx, fileId);
  if (!f.attachedAt || !f.questionId) {
    if (f.uploadedById !== ctx.user.id) throw notFound("Pièce jointe introuvable.");
    return f;
  }
  await getQuestion(ctx, f.questionId); // visibilité
  return f;
}

export async function readBridgeFile(ctx: BridgeCtx, fileId: string) {
  const f = await checkBridgeFileAccess(ctx, fileId);
  const [row] = await db.select({ data: T.bridgeFiles.data }).from(T.bridgeFiles).where(eq(T.bridgeFiles.id, f.id));
  return { ...f, data: row.data };
}

export async function deleteBridgeFile(ctx: BridgeCtx, fileId: string) {
  const f = await fileMeta(ctx, fileId);
  if (!f.attachedAt || !f.questionId) {
    if (f.uploadedById !== ctx.user.id) throw notFound("Pièce jointe introuvable.");
    await db.delete(T.bridgeFiles).where(eq(T.bridgeFiles.id, f.id));
    return { ok: true };
  }
  const q = await getQuestion(ctx, f.questionId);
  const view = q.files.find((x) => x.id === f.id);
  if (!view?.perms.delete) throw forbidden("Vous ne pouvez pas retirer cette pièce jointe.");
  await db.transaction(async (tx) => {
    await tx.delete(T.bridgeFiles).where(eq(T.bridgeFiles.id, f.id));
    await tx.update(T.bridgeQuestions).set({ lastActivityAt: new Date() }).where(eq(T.bridgeQuestions.id, q.id));
    await bridgeEvent(ctx, q.id, "detach", `Pièce jointe retirée : ${f.name}`, { file: f.name }, null, tx);
  });
  return { ok: true };
}
