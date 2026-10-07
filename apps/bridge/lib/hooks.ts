"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { fetcher } from "./api";
import type { Access, Bootstrap, Me, Party, Question } from "./types";

export function useMe() {
  return useSWR<Me>("/api/bridge/auth/me", fetcher, { revalidateOnFocus: false });
}

/** Configuration du client et droits de l'utilisateur, avec les libellés des deux organisations. */
export function useClient(slug: string) {
  const swr = useSWR<Bootstrap>(slug ? `/api/bridge/c/${slug}` : null, fetcher, { revalidateOnFocus: false });
  const helpers = useMemo(() => {
    const b = swr.data;
    const streams = b?.streams ?? [];
    const str = new Map(streams.map((s) => [s.id, s]));
    const label = (p: Party | null | undefined) => (p === "PROVIDER" ? b?.client.providerName ?? "Wifirst" : p === "CLIENT" ? b?.client.clientName ?? "Client" : "");
    const access = (streamId: string): Access => b?.me.access[streamId] ?? "NONE";
    const canCreate = !!b && (b.me.canCreate.PROVIDER.length > 0 || b.me.canCreate.CLIENT.length > 0);
    const order = new Map(streams.map((s, i) => [s.id, i]));
    return { str, label, access, canCreate, order };
  }, [swr.data]);
  return { ...swr, ...helpers, base: `/api/bridge/c/${slug}` };
}

export type ClientCtx = ReturnType<typeof useClient>;

export function useQuestions(slug: string, deleted = false) {
  return useSWR<Question[]>(slug ? `/api/bridge/c/${slug}/questions${deleted ? "?deleted=1" : ""}` : null, fetcher, { refreshInterval: 60_000 });
}
