"use client";

import { api, toast } from "./api";

/** Dépôt d'une pièce jointe directement sur l'API (gros fichiers), avec un jeton court obtenu par la session. */

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
let cached: { token: string; until: number; maxBytes: number } | null = null;

async function uploadToken() {
  if (cached && cached.until > Date.now()) return cached;
  const r = await api<{ token: string; maxBytes: number }>("/api/bridge/auth/upload-token");
  cached = { token: r.token, until: Date.now() + 12 * 60_000, maxBytes: r.maxBytes };
  return cached;
}

export interface Uploaded {
  id: string;
  name: string;
  mime: string;
  size: number;
  attached: boolean;
}

export async function uploadFile(slug: string, file: File, target: { questionId?: string; messageId?: string } = {}, onProgress?: (pct: number) => void): Promise<Uploaded> {
  const t = await uploadToken();
  if (file.size > t.maxBytes) {
    const msg = `${file.name} : fichier trop volumineux (20 Mo au plus).`;
    toast("error", msg);
    throw new Error(msg);
  }
  const qs = new URLSearchParams();
  if (target.questionId) qs.set("questionId", target.questionId);
  if (target.messageId) qs.set("messageId", target.messageId);
  const query = qs.toString();
  const url = `${API_URL}/api/bridge/c/${slug}/files${query ? `?${query}` : ""}`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${t.token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { error?: string } & Partial<Uploaded> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* réponse vide */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Uploaded);
      else {
        if (xhr.status === 401) cached = null;
        const msg = body.error ?? `Dépôt impossible (${xhr.status})`;
        toast("error", `${file.name} : ${msg}`);
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => {
      const msg = `${file.name} : dépôt interrompu, vérifiez votre réseau.`;
      toast("error", msg);
      reject(new Error(msg));
    };
    xhr.send(file);
  });
}

/** Ouvre (aperçu) ou télécharge une pièce jointe par un lien signé de quelques minutes. */
export async function openFile(slug: string, fileId: string, mime: string) {
  const preview = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(mime);
  // la fenêtre s'ouvre tout de suite (sinon le navigateur la bloque), l'adresse arrive ensuite
  const w = preview ? window.open("", "_blank") : null;
  try {
    const r = await api<{ path: string }>(`/api/bridge/c/${slug}/files/${fileId}/link`);
    const href = `${API_URL}${r.path}${preview ? "?inline=1" : ""}`;
    if (w) w.location.href = href;
    else window.location.href = href;
  } catch {
    w?.close();
  }
}

export function fileSize(n: number) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} Mo`;
}
