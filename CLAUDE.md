# WacMan : consignes pour Claude

WacMan (Wifirst Account Management) remplace l'espace Notion « La Poste - PSTNG » : pilotage multi-comptes clients de Wifirst, premier compte La Poste (programme PST-NG). Propriétaire et seul décideur : Florent Jolivet (Overdrive Management, directeur de projet PST-NG chez Wifirst).

**Avant toute évolution, lire `docs/PASSATION.md`** (contexte complet, historique, méthode, pièges, backlog), puis `docs/SPECIFICATION.md` et `docs/ARCHITECTURE.md`.

## Règles permanentes
- Interface en français, pensée d'abord pour le mobile.
- À chaque évolution : mettre à jour `docs/SPECIFICATION.md` (version courante, sections concernées, une ligne au journal des évolutions avec la demande et l'effet) et `docs/ARCHITECTURE.md` (et `docs/EXPLOITATION.md` si l'hébergement change).
- Rédaction (documents, libellés, messages, commits) : pas de tiret cadratin, pas de flèche, pas de « · » en séparateur ; phrases simples, vocabulaire du programme (build, stream, sprint, livrable, lot).
- Toujours des projets distincts de turbolife, TurboAgenda et Flogger Forge dans Vercel, Railway et Resend. Ne jamais toucher à ces autres projets.
- Ne jamais saisir ni afficher de secret (clés API, mots de passe, jetons) : Florent les colle lui-même. Demander avant toute action destructive ou irréversible.
- Pas de prettier sur le dépôt (aucune configuration : il reformaterait tout).

## Commandes
```bash
npm ci
npx tsc -p packages/core --noEmit && npx tsc -p apps/api --noEmit && (cd apps/web && npx tsc --noEmit)
bash tools/check_markup_sync.sh          # markup.ts identique dans core et web
bash tests/dev_up.sh                     # environnement local (voir tests/README.md)
bash tests/rebuild_web.sh                # next build (types et lint) puis relance
bash tests/run_all.sh                    # toutes les suites de non-régression
npm run db:generate -w @wacman/core      # nouvelle migration après une modification de schema.ts
```

## Mise en ligne
Un push sur `main` du dépôt GitHub `OverdriveManagement/wacman` redéploie l'API (Railway, service `wacman-api`, migrations jouées au démarrage) et le front (Vercel, projet `wacman`). Après le push : vérifier le déploiement Railway (statut SUCCESS et journaux de démarrage sans erreur) et Vercel (READY). Identifiants dans `docs/PASSATION.md`.

## Repères de code
- `packages/core` : schéma Drizzle, migrations `drizzle/`, registre des entités `src/entities.ts` (REST générique, assistant et MCP partagent validation, droits et journal), services `src/services/*`.
- `apps/api` : Fastify (`src/routes.ts`), assistant (`src/assistant/`), MCP (`src/mcp.ts`), propositions de Claude (`src/ai.ts`), exports (`src/exports/`).
- `apps/web` : Next.js 15 (App Router), pages `app/a/[slug]/*`, composants `components/*`, CR en HTML `lib/reportHtml.ts`.
