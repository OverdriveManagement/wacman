"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ErrorBoundary";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[WacMan]", error);
  }, [error]);
  return (
    <main className="mx-auto max-w-xl py-10">
      <ErrorPanel message={error.message} onRetry={reset} />
    </main>
  );
}
