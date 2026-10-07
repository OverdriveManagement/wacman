"use client";

import { createContext, useContext } from "react";
import { useSWRConfig } from "swr";
import { api } from "@/lib/api";
import type { ClientCtx } from "@/lib/hooks";
import type { Bootstrap, Party, Question, QuestionDetail } from "@/lib/types";

export const ClientContext = createContext<ClientCtx | null>(null);

/** Client affiché (configuration chargée). */
export function useCl() {
  const c = useContext(ClientContext);
  if (!c?.data) throw new Error("Client non chargé");
  return c as ClientCtx & { data: Bootstrap };
}

/** Écritures sur les questions : la réponse de l'API (question complète) met à jour la liste et le détail. */
export function useQuestionActions() {
  const cl = useCl();
  const { mutate } = useSWRConfig();
  const base = cl.base;
  const listKey = `${base}/questions`;
  const apply = async (p: Promise<QuestionDetail>) => {
    const d = await p;
    await mutate(`${base}/questions/${d.id}`, d, { revalidate: false });
    await mutate(listKey, (list?: Question[]) => (list ? list.map((x) => (x.id === d.id ? { ...x, ...d } : x)) : list), { revalidate: true });
    return d;
  };
  const post = (path: string, json: unknown = {}) => api<QuestionDetail>(`${base}${path}`, { method: "POST", json });
  return {
    refresh: async (id?: string) => {
      if (id) await mutate(`${base}/questions/${id}`);
      await mutate(listKey);
    },
    create: async (json: unknown) => {
      const d = await post("/questions", json);
      await mutate(`${base}/questions/${d.id}`, d, { revalidate: false });
      await mutate(listKey);
      return d;
    },
    update: (id: string, json: Record<string, unknown>) => apply(api<QuestionDetail>(`${base}/questions/${id}`, { method: "PATCH", json })),
    assign: (id: string, party: Party) => apply(post(`/questions/${id}/assign`, { party })),
    close: (id: string) => apply(post(`/questions/${id}/close`)),
    reopen: (id: string, json: { party?: Party; as?: Party; body?: string; fileIds?: string[] }) => apply(post(`/questions/${id}/reopen`, json)),
    respond: (id: string, json: { body: string; party?: Party; outcome: Party | "CLOSE"; fileIds?: string[] }) => apply(post(`/questions/${id}/messages`, json)),
    editMessage: (messageId: string, body: string) => apply(api<QuestionDetail>(`${base}/messages/${messageId}`, { method: "PATCH", json: { body } })),
    remove: async (id: string) => {
      await api(`${base}/questions/${id}`, { method: "DELETE" });
      await mutate(listKey);
      await mutate(`${listKey}?deleted=1`);
    },
    restore: async (id: string) => {
      const d = await post(`/questions/${id}/restore`);
      await mutate(listKey);
      await mutate(`${listKey}?deleted=1`);
      return d;
    },
  };
}
