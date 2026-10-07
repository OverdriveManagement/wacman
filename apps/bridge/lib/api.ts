"use client";

/** Appels à l'API WiBridge (/api/bridge/*), relayés par Vercel vers l'API commune. */

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Listener = (msg: { type: "error" | "success"; text: string }) => void;
const listeners = new Set<Listener>();
export function onToast(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function toast(type: "error" | "success", text: string) {
  listeners.forEach((l) => l({ type, text }));
}

/** Écritures en cours (enregistrement au clic à l'extérieur d'un champ, par exemple). */
const pending = new Set<Promise<unknown>>();
export async function whenIdle() {
  while (pending.size) await Promise.allSettled([...pending]);
}

export function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; silent?: boolean } = {}): Promise<T> {
  const p = request<T>(path, init);
  if (init.method && init.method !== "GET") {
    pending.add(p);
    p.then(
      () => pending.delete(p),
      () => pending.delete(p),
    );
  }
  return p;
}

async function request<T>(path: string, init: RequestInit & { json?: unknown; silent?: boolean }): Promise<T> {
  const { json, silent, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "include",
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    const err = new ApiError(0, "Connexion impossible : vérifiez votre réseau puis réessayez.");
    if (!silent) toast("error", err.message);
    throw err;
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/bridge/auth/")) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    throw new ApiError(401, "Session expirée");
  }
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new ApiError(res.status, (body as { error?: string })?.error ?? `Erreur ${res.status}`, (body as { details?: unknown })?.details);
    if (!silent) toast("error", err.message);
    throw err;
  }
  return body as T;
}

export const fetcher = <T,>(path: string) => api<T>(path, { silent: true });

/** Télécharge un fichier produit par l'API (export Excel). */
export async function download(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) {
    let msg = `Export impossible (${res.status})`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* ignore */
    }
    toast("error", msg);
    return;
  }
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) ?? /filename="([^"]+)"/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : "export";
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
