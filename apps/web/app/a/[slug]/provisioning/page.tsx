"use client";

import { ComingSoon } from "@/components/ComingSoon";
import { useAcc } from "@/components/AccountContext";

export default function ProvisioningPage() {
  const acc = useAcc();
  return (
    <ComingSoon icon="🛰️" title="Provisioning management">
      Section réservée au suivi du provisioning du compte {acc.data.account.clientName}. Son contenu sera défini dans une prochaine version ; elle peut être masquée dans les paramètres du compte.
    </ComingSoon>
  );
}
