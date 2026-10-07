import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">Page introuvable</h1>
      <p className="text-sm text-muted">Cette adresse ne correspond à aucune page de WiBridge.</p>
      <Link href="/" className="btn btn-primary">
        Retour à l'accueil
      </Link>
    </main>
  );
}
