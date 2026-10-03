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
- L'assistant appelle l'API Railway en direct (jeton court de 10 minutes délivré par `/api/auth/assistant-token`) pour que les réponses longues ne soient pas coupées par le relais Vercel.

## Dépôt (monorepo npm workspaces)

| Dossier | Rôle |
|---|---|
| `packages/core` | Modèle de données (Drizzle ORM), migrations SQL (`drizzle/`), règles métier, droits, journal, import et export de compte. Partagé par l'API. |
| `apps/api` | Serveur Fastify : authentification, routes REST, exports PowerPoint (pptxgenjs) et Excel (exceljs), assistant Claude, envoi des codes (Resend). |
| `apps/web` | Interface Next.js (App Router, React 19, Tailwind 4, SWR, dnd-kit). |
| `tools/notion_to_wacman.py` | Conversion de l'export Notion en fichier d'import. |
| `docs/` | Spécification, architecture, exploitation. |

## Modèle de données (packages/core/src/schema.ts)

- `users`, `login_challenges` (codes e-mail, hachés), `memberships` (rôle par compte).
- `accounts` : compte client, sections actives (`modules`), textes et libellés (`settings`), compteur des références de cartes.
- Configuration par compte : `options` (listes de valeurs, par `kind`), `streams`, `sprints`, `meeting_types` (blocs et libellés), `governance_bodies`, `contacts`.
- Contenu : `cards`, `meetings`, `highlights`, `stream_statuses`, `topics`, `risks` (+ `risk_cards`).
- Traçabilité : `comments`, `audit_logs`, `assistant_runs`.

Toutes les tables de contenu portent `account_id` ; chaque requête est filtrée par compte et chaque référence (stream, sprint, valeur de liste, contact, séance) est vérifiée comme appartenant au compte.

## Règles métier partagées

Le registre `packages/core/src/entities.ts` décrit chaque entité éditable (schéma de validation zod, rôle requis, champ titre). Les routes REST génériques (`/api/accounts/:compte/e/:entité`) et les outils de l'assistant passent tous deux par ce registre : mêmes droits, même validation, même journal.

## Authentification

- Mot de passe haché (bcrypt, coût 11), code e-mail à 6 chiffres haché (SHA-256), session JWT HS256 de 14 jours dans un cookie HttpOnly, SameSite Lax, Secure en production.
- `session_version` sur l'utilisateur : incrémentée au changement de mot de passe ou à la désactivation, elle invalide les sessions ouvertes.

## Migrations

Générées par `npm run db:generate -w @wacman/core` (drizzle-kit) dans `packages/core/drizzle/`, appliquées automatiquement au démarrage de l'API.

## Pourquoi Drizzle plutôt que Prisma

Drizzle est entièrement en JavaScript : ni binaire de moteur à télécharger au build, ni dépendance à un hôte externe. Le build est le même partout (poste local, Railway, environnement de développement de Claude).
