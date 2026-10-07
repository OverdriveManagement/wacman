"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "Inter, Arial, sans-serif", background: "#0B1620", color: "#E2E8F0", padding: 32 }}>
        <h1 style={{ fontSize: 20 }}>WiBridge : affichage interrompu</h1>
        <p>Une erreur inattendue s'est produite. Vos données ne sont pas perdues.</p>
        <p style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>{error.message}</p>
        <button onClick={reset} style={{ marginRight: 8, padding: "8px 14px" }}>
          Réessayer
        </button>
        <button onClick={() => window.location.reload()} style={{ padding: "8px 14px" }}>
          Recharger la page
        </button>
      </body>
    </html>
  );
}
