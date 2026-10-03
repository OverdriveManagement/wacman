import type { ReactNode } from "react";

export function ComingSoon({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="card p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-3xl">{icon}</div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{children}</p>
        <span className="mt-5 inline-block rounded-full border border-line px-3 py-1 text-xs font-semibold text-ocre">À venir</span>
      </div>
    </div>
  );
}
