"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ErrorBoundary";

/** Erreur dans une page d'un compte : la navigation du compte reste disponible. */
export default function AccountPageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[WacMan]", error);
  }, [error]);
  return <ErrorPanel message={error.message} onRetry={reset} />;
}
