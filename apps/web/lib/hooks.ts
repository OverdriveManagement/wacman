"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { fetcher } from "./api";
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
