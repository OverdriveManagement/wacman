"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { fetcher } from "./api";
import { useEditMode } from "@/components/AccountContext";
import type { AccountSummary, Bootstrap, Option, OptionKind, User } from "./types";

export function useMe() {
  return useSWR<{ user: User; accounts: AccountSummary[] }>("/api/auth/me", fetcher, { revalidateOnFocus: false });
}

export function useAccount(slug: string) {
  const swr = useSWR<Bootstrap>(slug ? `/api/accounts/${slug}` : null, fetcher);
  const helpers = useMemo(() => {
    const b = swr.data;
    const opt = new Map((b?.options ?? []).map((o) => [o.id, o]));
    const str = new Map((b?.streams ?? []).map((s) => [s.id, s]));
    const spr = new Map((b?.sprints ?? []).map((s) => [s.id, s]));
    const ctc = new Map((b?.contacts ?? []).map((c) => [c.id, c]));
    const byKind = (k: OptionKind): Option[] => (b?.options ?? []).filter((o) => o.kind === k).sort((x, y) => x.order - y.order);
    const canEdit = b?.role === "ADMIN" || b?.role === "EDITOR";
    const isAdmin = b?.role === "ADMIN";
    const currentSprint = b?.sprints.find((s) => s.state === "CURRENT") ?? b?.sprints.find((s) => s.state === "UPCOMING") ?? b?.sprints[0];
    const isDone = (statusId: string | null) => !!(statusId && opt.get(statusId)?.meta?.done);
    return { opt, str, spr, ctc, byKind, canEdit, isAdmin, currentSprint, isDone };
  }, [swr.data]);
  return { ...swr, ...helpers, base: `/api/accounts/${slug}` };
}

export type AccountCtx = ReturnType<typeof useAccount>;

/**
 * Créations à la volée depuis les listes déroulantes (porteur, type, criticité…).
 * Chaque fonction n'est fournie que si le rôle le permet (annuaire : éditeur ; listes et streams : administrateur).
 */
export function useCreators(acc: AccountCtx) {
  // les listes de valeurs et les streams relèvent de la structure : création réservée au mode édition
  const editMode = useEditMode();
  return useMemo(() => {
    const post = async <T extends { id: string }>(entity: string, json: unknown) => {
      const { api } = await import("./api");
      const row = await api<T>(`${acc.base}/e/${entity}`, { method: "POST", json });
      await acc.mutate();
      return row.id;
    };
    const option = (kind: OptionKind) =>
      editMode ? (label: string) => post("option", { kind, label, order: Math.max(0, ...acc.byKind(kind).map((o) => o.order)) + 1 }) : undefined;
    return {
      contact: acc.canEdit ? (name: string) => post("contact", { name }) : undefined,
      stream: editMode ? (name: string) => post("stream", { name, order: Math.max(0, ...(acc.data?.streams ?? []).map((s) => s.order)) + 1 }) : undefined,
      option,
    };
  }, [acc, editMode]);
}
