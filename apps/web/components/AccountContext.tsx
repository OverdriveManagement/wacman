"use client";

import { createContext, useContext } from "react";
import type { AccountCtx } from "@/lib/hooks";

export const AccountContext = createContext<AccountCtx | null>(null);

export function useAcc(): AccountCtx & { data: NonNullable<AccountCtx["data"]> } {
  const v = useContext(AccountContext);
  if (!v || !v.data) throw new Error("AccountContext absent");
  return v as AccountCtx & { data: NonNullable<AccountCtx["data"]> };
}
