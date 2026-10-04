"use client";

import { createContext, useContext } from "react";
import type { AccountCtx } from "@/lib/hooks";

export const AccountContext = createContext<AccountCtx | null>(null);

export function useAcc(): AccountCtx & { data: NonNullable<AccountCtx["data"]> } {
  const v = useContext(AccountContext);
  if (!v || !v.data) throw new Error("AccountContext absent");
  return v as AccountCtx & { data: NonNullable<AccountCtx["data"]> };
}

/**
 * Mode édition (administrateurs) : les boutons de structure (sprints, colonnes, streams, types de séance,
 * listes de valeurs, comitologie) n'apparaissent qu'en mode édition. Le contenu (textes, étiquettes,
 * déplacement des cartes) reste modifiable en permanence.
 */
export const EditModeContext = createContext<{ editing: boolean; setEditing: (v: boolean) => void }>({ editing: false, setEditing: () => undefined });

/** Vrai si l'utilisateur est administrateur du compte et a activé le mode édition. */
export function useEditMode(): boolean {
  const { editing } = useContext(EditModeContext);
  const acc = useContext(AccountContext);
  return editing && !!acc?.isAdmin;
}
