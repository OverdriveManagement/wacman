# WacMan : consignes pour Claude

WacMan (Wifirst Account Management) remplace l'espace Notion « La Poste - PSTNG » : pilotage multi-comptes clients de Wifirst, premier compte La Poste (programme PST-NG). Propriétaire et seul décideur : Florent Jolivet (Overdrive Management, directeur de projet PST-NG chez Wifirst).

Le dépôt porte aussi **WiBridge** (`apps/bridge`) : l'espace d'échange de questions entre Wifirst et ses clients (premier client La Poste), interface séparée sur la même API et la même base, avec des comptes distincts de WacMan (sauf le super-administrateur).

**Avant toute évolution, lire `docs/PASSATION.md`** (contexte complet, historique, méthode, pièges, backlog), puis `docs/SPECIFICATION.md` (ou `docs/SPECIFICATION_WIBRIDGE.md` pour WiBridge) et `docs/ARCHITECTURE.md`.

## Règles permanentes
- Interface en français, pensée d'abord pour le mobile.
- À chaque évolution : mettre à jour la spécification concernée (`docs/SPECIFICATION.md` pour WacMan, `docs/SPECIFICATION_WIBRIDGE.md` pour WiBridge : version courante, sections concernées, une ligne au journal des évolutions avec la demande et l'effet) et `docs/ARCHITECTURE.md` (et `docs/EXPLOITATION.md` si l'hébergement change).
- Rédaction (documents, libellés, messages, commits) : pas de tiret cadratin, pas de flèche, pas de « · » en séparateur ; phrases simples, vocabulaire du programme (build, stream, sprint, livrable, lot).
- Toujours des projets distincts de turbolife, TurboAgenda et Flogger Forge dans Vercel, Railway et Resend. Ne jamais toucher à ces autres projets.
- Ne jamais saisir ni afficher de secret (clés API, mots de passe, jetons) : Florent les colle lui-même. Demander avant toute action destructive ou irréversible.
- Pas de prettier sur le dépôt (aucune configuration : il reformaterait tout).
- WacMan et WiBridge restent séparés : aucun lien de l'un vers l'autre, routes WiBridge sous `/api/bridge/` uniquement, sessions distinctes.

## Commandes
```bash
npm ci
npx tsc -p packages/core --noEmit && npx tsc -p apps/api --noEmit && (cd apps/web && npx tsc --noEmit) && (cd apps/bridge && npx tsc --noEmit)
bash tools/check_markup_sync.sh          # markup.ts identique dans core, web et bridge
bash tests/dev_up.sh                     # environnement local (voir tests/README.md)
bash tests/rebuild_web.sh                # next build de WacMan (types et lint) puis relance (port 3000)
bash tests/rebuild_bridge.sh             # next build de WiBridge puis relance (port 3001)
bash tests/run_all.sh                    # toutes les suites de non-régression
bash tests/run_all.sh bridge_api.py bridge_e2e.py   # suites WiBridge seules
npm run db:generate -w @wacman/core      # nouvelle migration après une modification de schema.ts
```

## Mise en ligne
Un push sur `main` du dépôt GitHub `OverdriveManagement/wacman` redéploie l'API (Railway, service `wacman-api`, migrations jouées au démarrage), le front WacMan (Vercel, projet `wacman`) et le front WiBridge (Vercel, projet `wibridge-wifirst`). Après le push : vérifier le déploiement Railway (statut SUCCESS et journaux de démarrage sans erreur) et les deux déploiements Vercel (READY). Identifiants dans `docs/PASSATION.md`.

## Repères de code
- `packages/core` : schéma Drizzle, migrations `drizzle/`, registre des entités `src/entities.ts` (REST générique, assistant et MCP partagent validation, droits et journal), services `src/services/*`, WiBridge dans `src/bridge/*` (droits par stream, questions, pièces jointes, comptes, administration, notifications).
- `apps/api` : Fastify (`src/routes.ts`), assistant (`src/assistant/`), MCP (`src/mcp.ts`), propositions de Claude (`src/ai.ts`), exports (`src/exports/`), WiBridge (`src/bridge/` : routes, session, e-mails, export Excel, récapitulatif quotidien).
- `apps/web` : Next.js 15 (App Router), pages `app/a/[slug]/*`, composants `components/*`, CR en HTML `lib/reportHtml.ts`.
- `apps/bridge` : WiBridge, Next.js 15, pages `app/c/[slug]` (questions), `app/admin`, `app/compte`, `app/login`, `app/invitation` ; composants `components/questions/*`.
