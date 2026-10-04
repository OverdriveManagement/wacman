# WacMan : architecture technique

## Vue d'ensemble

```
Navigateur ──► Vercel (Paris, cdg1)                 Railway (Amsterdam, europe-west4)
               apps/web : Next.js 15                 apps/api : Fastify 5 (Node 20+)
               pages en React, appels /api/* ──────► REST /api/*  ──► PostgreSQL 16
               relayés vers Railway (même origine)    exports PPTX / XLSX
               assistant : appel direct à l'API ────► SSE /assistant ──► API Claude (Anthropic)
                                                      e-mails ──► Resend
```

- Le front ne contient aucun secret : toutes les données et tous les secrets sont côté API (Railway).
- Les appels `/api/*` passent par une réécriture Vercel vers l'API : le cookie de session est donc posé sur le domaine du front (pas de cookie tiers).
- L'assistant appelle l'API Railway en direct (jeton court de 10 minutes délivré par `/api/auth/assistant-token`) pour que les réponses longues ne soient pas coupées par le relais Vercel. Le flux SSE envoie un commentaire de maintien toutes les 15 secondes ; l'arrêt est détecté sur la fermeture de la réponse (la requête entrante se ferme dès la lecture du corps).
- Claude (claude.ai, Desktop, Code) se branche sur le serveur MCP de l'API (`/api/mcp`), authentifié par jeton d'accès personnel.

## Dépôt (monorepo npm workspaces)

| Dossier | Rôle |
|---|---|
| `packages/core` | Modèle de données (Drizzle ORM), migrations SQL (`drizzle/`), règles métier, droits, journal, import et export de compte. Partagé par l'API. |
| `apps/api` | Serveur Fastify : authentification, routes REST, exports PowerPoint (pptxgenjs) et Excel (exceljs), assistant Claude, envoi des codes (Resend). |
| `apps/web` | Interface Next.js (App Router, React 19, Tailwind 4, SWR, dnd-kit). |
| `tools/notion_to_wacman.py` | Conversion de l'export Notion en fichier d'import. |
| `docs/` | Spécification, architecture, exploitation. |

## Modèle de données (packages/core/src/schema.ts)

- `users`, `login_challenges` (codes e-mail hachés ; `purpose` LOGIN ou RESET pour le mot de passe oublié), `memberships` (rôle par compte), `api_tokens` (jetons d'accès personnels : hachage SHA-256, préfixe affiché, lecture seule, expiration, révocation, dernière utilisation).
- `cards` : livrables, avec `start_date` (début prévu) et `due_date` (échéance) pour le planning, et `content_updated_at` (dernière modification du contenu, mise à jour par `updateEntity` quand un champ autre que `position` ou `archived` change vraiment, et par `moveCard` quand le statut ou le stream change ; sert à l'étiquette de fraîcheur). Les paliers de fraîcheur sont dans `accounts.settings.freshness` (validés par `freshnessSchema`).
- `accounts` : compte client, sections actives (`modules`), textes et libellés (`settings`), compteur des références de cartes.
- Configuration par compte : `options` (listes de valeurs, par `kind`), `streams`, `sprints`, `meeting_types` (blocs et libellés), `governance_bodies`, `contacts`.
- Contenu : `cards`, `meetings`, `highlights`, `stream_statuses`, `topics`, `risks` (+ `risk_cards`).
- Traçabilité : `comments`, `audit_logs`, `assistant_runs`.

Toutes les tables de contenu portent `account_id` ; chaque requête est filtrée par compte et chaque référence (stream, sprint, valeur de liste, contact, séance) est vérifiée comme appartenant au compte.

## Règles métier partagées

Le registre `packages/core/src/entities.ts` décrit chaque entité éditable (schéma de validation zod, rôle requis, champ titre). Les routes REST génériques (`/api/accounts/:compte/e/:entité`) et les outils de l'assistant passent tous deux par ce registre : mêmes droits, même validation, même journal.

## Services transverses (packages/core/src/services)

| Fichier | Rôle |
|---|---|
| `accounts.ts` | Comptes clients : création (vide ou par duplication), réglages, chargement initial |
| `users.ts` | Connexion en deux étapes, mot de passe oublié, membres et utilisateurs |
| `program.ts` | Cartes (déplacement, duplication), bascule de sprint, séances, commentaires, journal |
| `insights.ts` | Tableau de bord (indicateurs calculés côté serveur, date du jour à Paris) et recherche globale (insensible aux accents par `translate(lower(...))`, sans extension PostgreSQL) |
| `tokens.ts` | Jetons d'accès personnels : création, liste, révocation, résolution |
| `transfer.ts` | Import et export d'un compte (format `wacman-account-v1`) |

Le balisage léger est découpé par un seul module, `packages/core/src/markup.ts` (`tokenizeInline`, `parseLine`, `markupToPlain`), copié à l'identique dans `apps/web/lib/markup.ts` (le script `tools/check_markup_sync.sh` vérifie que les deux copies sont identiques). L'affichage (`Markdown.tsx`), le compte rendu (`lib/reportHtml.ts`, `lib/report.ts`), Excel (`exports/data.ts`) et PowerPoint (`exports/pptx.ts`) en dérivent.

Les identifiants sont contrôlés par `isUuid` (`context.ts`, format strict) avant toute requête ; les filtres de liste génériques sont adaptés au type de colonne (une valeur impossible renvoie une liste vide).

Le contrôle des références (`checkRefs` dans `entities.ts`) vérifie le format UUID, l'appartenance au compte et, pour les listes de valeurs, le type attendu selon le champ (par exemple `statusId` d'une carte dans CARD_STATUS, d'un risque dans RISK_STATUS).

## Serveur MCP (apps/api/src/mcp.ts)

- Transport HTTP « streamable », sans état : `POST /api/mcp` (en-tête `Authorization: Bearer wac_…`) ou `POST /api/mcp/wac_…` (jeton dans l'adresse, pour les connecteurs personnalisés de claude.ai qui n'envoient pas d'en-tête). `GET` répond 405 (pas de flux serveur).
- Méthodes : `initialize` (versions 2025-06-18, 2025-03-26, 2024-11-05), `ping`, `tools/list`, `tools/call`, notifications ignorées (202).
- Outils : `list_accounts` plus ceux de l'assistant intégré (`apps/api/src/assistant/tools.ts`), auxquels s'ajoute le paramètre `account` ; mêmes services, mêmes droits, même journal (marqué via Claude). Un jeton en lecture seule ne liste pas les outils d'écriture.
- Les jetons présents dans une adresse sont masqués dans les journaux de l'API (`wac_***`).

## Authentification

- Mot de passe haché (bcrypt, coût 11), code e-mail à 6 chiffres haché (SHA-256), session JWT HS256 de 14 jours dans un cookie HttpOnly, SameSite Lax, Secure en production.
- `session_version` sur l'utilisateur : incrémentée au changement de mot de passe (y compris par « mot de passe oublié ») ou à la désactivation, elle invalide les sessions ouvertes.
- Jeton d'accès personnel (`Bearer wac_…`) accepté sur toutes les routes REST et sur le serveur MCP ; refusé pour créer des jetons, changer de mot de passe ou appeler l'assistant intégré. En lecture seule, le contexte est ramené au rôle Lecteur (`ctx.readOnly`, `assertWritable`) et toute requête REST autre que GET est refusée par un crochet global (`server.ts`).
- Jeton court de l'assistant (10 min) : accepté uniquement sur `POST /api/accounts/:compte/assistant` (`resolveUser`).
- Codes à 6 chiffres : l'essai est compté par un `UPDATE … attempts = attempts + 1 WHERE attempts < 5 RETURNING` avant la comparaison, ce qui borne aussi les essais simultanés. Limitation des tentatives en mémoire par IP et par e-mail (table purgée au-delà de 5 000 entrées).

## Interface (apps/web)

- Pages d'erreur `app/error.tsx`, `app/global-error.tsx` et `app/a/[slug]/error.tsx`, composant `ErrorBoundary` autour du panneau de l'assistant.
- Fenêtres modales rendues dans `document.body` (portail React) : un parent avec `backdrop-filter` (en-tête) crée un bloc conteneur qui décalait les éléments `position: fixed`.
- Liens directs : `?card=` (kanban), `?risk=` (risques), `?m=` (séance) ; ouverts une fois puis retirés de l'adresse.
- Vue d'impression `app/print/[slug]/meeting/[id]` hors de la mise en page du compte ; manifeste `app/manifest.ts` et icônes dans `public/`.
- Paramétrage en place : `components/config.tsx` (menu « ⋯ » rendu en portail pour ne pas être rogné par les zones défilantes, fenêtres Sprint, Stream, Valeur de liste, bascule de sprint), `components/MeetingTypeModal.tsx`, `OptionSelect` avec création à la volée (`useCreators` dans `lib/hooks.ts`, selon le rôle).
- Mode édition : `EditModeContext` et `useEditMode()` (`components/AccountContext.tsx`, vrai si administrateur et mode activé) conditionnent les boutons de structure ; `useCreators` ne propose la création de valeurs et de streams qu'en mode édition.
- Étiquettes : `components/Tag.tsx` (`TagSelect`, `TagMulti`, `DateTag`, pastille `EmptyDot`, `Popover` rendu en portail) remplacent les listes déroulantes visibles.
- Fraîcheur : `components/Freshness.tsx` (étiquette, éditeur et fenêtre des paliers) et `lib/freshness.ts` (jours calendaires à l'heure de Paris, palier, contrôles identiques à l'API).
- Planning : `components/Planning.tsx` (Gantt en HTML et CSS, glisser au jour près par événements pointeur ; règles de barre partagées avec la slide PowerPoint : début prévu ou début du sprint, échéance ou fin du sprint, jalon si échéance seule).
- Saisie fiable : `useSubmit` (`components/ui.tsx`) ignore un second envoi pendant le premier ; `whenIdle()` (`lib/api.ts`) attend la fin des écritures en cours (utilisé par « Copier le CR ») ; les fenêtres (`Modal`) forment une pile : Échap et le verrouillage du défilement ne concernent que la fenêtre du dessus ; `acc.mutate()` rafraîchit aussi toutes les données du compte (cartes, séances, tableau de bord).
- Mise en forme : `components/RichText.tsx` (barre d'outils, raccourcis, prolongation des listes ; transformations pures sur le texte et la sélection) et `components/Markdown.tsx` (rendu, cases cliquables). Le balisage léger est retiré ou converti par `plain()` (API) et `plainText()` (compte rendu texte), converti en HTML d'e-mail à styles en ligne par `mdToHtml()` (`lib/reportHtml.ts` : `meetingReportHtml()` et `copyRich()`, qui pose `text/html` et `text/plain` dans le presse-papiers, avec repli par sélection et copie), et converti en segments mis en forme par `runs()` (PowerPoint).

## Migrations

Générées par `npm run db:generate -w @wacman/core` (drizzle-kit) dans `packages/core/drizzle/`, appliquées automatiquement au démarrage de l'API. `0000_init` (V1), `0001_tokens_reset` (V1.1 : table `api_tokens`, colonne `login_challenges.purpose`), `0002_card_start_planning` (V1.2 : colonne `cards.start_date` et ajout des blocs ALERT_CARDS et PLANNING aux types de séance à faits marquants), `0003_card_freshness` (V1.3 : colonne `cards.content_updated_at`, initialisée depuis `updated_at`, puis dates « Mis à jour » Notion pour le compte La Poste, sauf modification WacMan plus récente au journal), uniquement des ajouts.

## Pourquoi Drizzle plutôt que Prisma

Drizzle est entièrement en JavaScript : ni binaire de moteur à télécharger au build, ni dépendance à un hôte externe. Le build est le même partout (poste local, Railway, environnement de développement de Claude).
