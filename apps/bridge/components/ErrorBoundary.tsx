"use client";

import { Component, type ReactNode } from "react";

/** Isole une zone de l'interface : une erreur d'affichage n'emporte pas le reste de la page. */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string; onReset?: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[WiBridge] ${this.props.label ?? "Zone"} :`, error);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorPanel message={this.state.error.message} onRetry={this.reset} label={this.props.label} />;
  }
}

export function ErrorPanel({ message, onRetry, label }: { message?: string; onRetry?: () => void; label?: string }) {
  return (
    <div className="m-4 rounded-xl border border-red/50 bg-red/5 p-4 text-sm">
      <div className="font-semibold text-ink">{label ? `${label} : affichage interrompu` : "Affichage interrompu"}</div>
      <p className="mt-1 text-ink-2">Une erreur inattendue s'est produite. Vos données ne sont pas perdues.</p>
      {message && <p className="mt-2 break-words font-mono text-xs text-muted">{message}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && (
          <button className="btn btn-sm btn-primary" onClick={onRetry}>
            Réessayer
          </button>
        )}
        <button className="btn btn-sm" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </div>
    </div>
  );
}
