# WacMan : architecture technique

## Vue d'ensemble

```
Navigateur ──► Vercel (Paris, cdg1)                 Railway (Amsterdam, europe-west4)
               apps/web : Next.js 15                 apps/api : Fastify 5 (Node 20+)
               pages en React, appels /api/* ──────► REST /api/*  ──► PostgreSQL 16
               relayés vers Railway (même origine)    exports PPTX / XLSX
               assistant : appel direct à l'API ────► SSE /assistant ──► API Claude (Anthropic)
                                                      e-mails ──► Resend
Navigateur ──► Vercel (Paris, cdg1)
               apps/bridge : WiBridge, Next.js 15
               appels /api/bridge/* relayés ───────► REST /api/bridge/* (même API, même base)
               pièces jointes : dépôt direct ──────► POST /api/bridge/c/:client/files
```

- WiBridge (`apps/bridge`, https://wibridge-wifirst.vercel.app) est une seconde interface, publiée par un projet Vercel distinct, sur la même API et la même base que WacMan. Ses routes sont toutes sous `/api/bridge/` et ses sessions sont distinctes de celles de WacMan (partie WiBridge plus bas).
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
| `apps/bridge` | Interface WiBridge (Next.js 15, React 19, Tailwind 4, SWR), port 3001 en local. |
| `tools/notion_to_wacman.py` | Conversion de l'export Notion en fichier d'import. |
| `tests/` | Suites de non-régression (API en Python, parcours navigateur Playwright), faux serveur Claude, scripts de l'environnement local. |
| `CLAUDE.md` | Consignes lues par Claude Code à l'ouverture du dépôt (renvoie vers `docs/PASSATION.md`). |
| `docs/` | Spécification, architecture, exploitation, passation. |

## Modèle de données (packages/core/src/schema.ts)

- `users` (avec `wacman_access`, `bridge_access`, `password_set` et `bridge_last_login_at` depuis WiBridge), `login_challenges` (codes e-mail hachés ; `purpose` LOGIN ou RESET pour WacMan, BRIDGE_LOGIN ou BRIDGE_RESET pour WiBridge), `memberships` (rôle par compte), `api_tokens` (jetons d'accès personnels : hachage SHA-256, préfixe affiché, lecture seule, expiration, révocation, dernière utilisation).
- `cards` : livrables, avec `start_date` (début prévu) et `due_date` (échéance) pour le planning, et `content_updated_at` (dernière modification du contenu, mise à jour par `updateEntity` quand un champ autre que `position` ou `archived` change vraiment, et par `moveCard` quand le statut ou le stream change ; sert à l'étiquette de fraîcheur). Les paliers de fraîcheur sont dans `accounts.settings.freshness` (validés par `freshnessSchema`).
- `accounts` : compte client, sections actives (`modules`), textes et libellés (`settings`), compteur des références de cartes.
- Configuration par compte : `options` (listes de valeurs, par `kind`), `streams`, `sprints`, `meeting_types` (blocs et libellés), `governance_bodies`, `contacts`.
- Contenu : `cards`, `meetings`, `highlights`, `stream_statuses`, `topics`, `risks` (+ `risk_cards`).
- Suivi (V1.5) : `actions` (relevé des actions : `party` WIFIRST, CLIENT ou JOINT, `owner_id` contact, `stream_id`, `card_id`, `meeting_type_id` série de séances, `meeting_id` séance de prise, `due_date`, `status` OPEN, DONE ou CANCELLED, `closed_at` tenu par le serveur à chaque changement de statut, `order`) et `decisions` (registre : `status` PENDING ou TAKEN, `decided_on` date de la décision ou date attendue, `stream_id`, `card_id`, `topic_id` sujet d'origine, `meeting_type_id`, `meeting_id`). Une action ou une décision appartient au compte et non à une séance : la séance affiche celles de sa série prises au plus tard à sa date, ouvertes ou closes depuis la séance précédente (`lib/followup.ts`, repris à l'identique côté PowerPoint).
- Traçabilité : `comments`, `audit_logs`, `assistant_runs`.
- WiBridge : tables `bridge_*`, sans lien avec les comptes WacMan (partie WiBridge).

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
| `transfer.ts` | Import et export d'un compte (format `wacman-account-v1`, avec commentaires, actions et décisions ; séances et sujets référencés par leur rang dans le fichier) |
| `review.ts` | Vues de synthèse calculées à partir du journal : `meetingChanges` (quoi de neuf depuis la séance précédente du même type, sur les jours de Paris), `streamReview` (revue d'un stream), `sprintReview` (bilan d'un sprint ; cartes reportées lues dans l'entrée de journal de la bascule, qui enregistre depuis la V1.5 `{ from, to, moved }`) |

Le balisage léger est découpé par un seul module, `packages/core/src/markup.ts` (`tokenizeInline`, `parseLine`, `markupToPlain`), copié à l'identique dans `apps/web/lib/markup.ts` et `apps/bridge/lib/markup.ts` (le script `tools/check_markup_sync.sh` vérifie que les trois copies sont identiques). L'affichage (`Markdown.tsx`), le compte rendu (`lib/reportHtml.ts`, `lib/report.ts`), Excel (`exports/data.ts`) et PowerPoint (`exports/pptx.ts`) en dérivent.

Les identifiants sont contrôlés par `isUuid` (`context.ts`, format strict) avant toute requête ; les filtres de liste génériques sont adaptés au type de colonne (une valeur impossible renvoie une liste vide).

Le contrôle des références (`checkRefs` dans `entities.ts`) vérifie le format UUID, l'appartenance au compte et, pour les listes de valeurs, le type attendu selon le champ (par exemple `statusId` d'une carte dans CARD_STATUS, d'un risque dans RISK_STATUS).

## Propositions de Claude hors assistant (apps/api/src/ai.ts)

- `extractFromTranscript` (`POST /api/accounts/:compte/ai/extract`, corps jusqu'à 25 Mo) : texte collé ou fichier en base64 (.docx lu par mammoth, .txt, .md, .vtt et .srt nettoyés des horodatages), tronqué à 250 000 caractères ; un appel `messages.create` avec `tool_choice` imposé (outil `proposer_suivi`) renvoie actions, cartes et décisions ; les noms de stream et de contact sont rapprochés de ceux du compte (`pick`, sans accents ni ponctuation), les dates mal formées écartées.
- `suggestHighlights` (`POST /api/accounts/:compte/meetings/:id/suggest-highlights`) : brouillon de faits marquants (outil `proposer_faits_marquants`) à partir de `meetingChanges` et des cartes en alerte.
- Rien n'est écrit : le navigateur crée ensuite les éléments validés par les routes génériques. Réservé aux éditeurs, en session navigateur (refusé par jeton d'accès), 30 appels par heure et par utilisateur (`throttle`).
- Routes de synthèse : `GET /api/accounts/:compte/meetings/:id/changes`, `GET /api/accounts/:compte/streams/:id/review`, `GET /api/accounts/:compte/sprints/:id/review`.

## Exports PowerPoint (apps/api/src/exports)

- `pptxKit.ts` : palette, polices, conversion du balisage en segments (`runs`), troncature (`clip`), pagination des tableaux.
- `pptx.ts` : `buildDeck` (paramètres `sections`, `sprintId`, `meetings`, `focus`, `name`), couverture, livrables compacts, faits marquants, statut des streams et sujets en tableau, cartes en alerte, planning. La section `meetings` vaut `highlights`, `statuses` et `topics`.
- `pptxDeck.ts` : slides au format des decks (livrables du sprint, météo des streams, focus stream, attentes du client, avancement des streams en cartes COPROJ, registre des décisions, relevé des actions, bilan de sprint), sur un `DeckKit` commun (création de slide, tableau paginé, données du compte).

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
- Accès à WacMan : `users.wacman_access` (vrai pour tous les comptes existants, faux pour un compte créé dans WiBridge) ou super-administrateur. Contrôlé à la connexion (après la comparaison du mot de passe, même refus qu'un mauvais mot de passe), au mot de passe oublié, à chaque requête de session (`userFromToken`) et pour les jetons d'accès (`resolveApiToken`). `listAllUsers` n'affiche que les comptes ayant accès à WacMan ; `addMember` et `adminCreateUser` n'ouvrent WacMan à un compte WiBridge que pour le super-administrateur.

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
- Suivi (V1.5) : `components/FollowUp.tsx` (listes éditables `ActionsList` et `DecisionsList`, utilisées par les séances, la page `followup` et la revue de stream), `lib/followup.ts` (porteurs, actions et décisions d'une séance, gabarits d'e-mail), `components/WorkshopImport.tsx` (import d'un compte rendu, validation une par une), `components/WhatsNew.tsx` (quoi de neuf, faits marquants proposés), `components/Review.tsx` (briques des revues et mode présentation plein écran), pages `streams` (revue de stream, stream dans `?s=` mis à jour par `history.replaceState`) et `sprints/[id]` (bilan). `components/ExportDialog.tsx` propose les modèles d'export (Program weekly, COPROJ, Bilan de sprint, Personnalisé) et accepte une séance présélectionnée.
- E-mails : `lib/reportHtml.ts` construit aussi l'objet (`mailSubject`, gabarit du type de séance), le bilan de sprint (`sprintReviewHtml`, `sprintReviewText`) ; le menu E-mail de la séance ouvre Gmail (`mail.google.com/mail/u/<compte>/?view=cm`) ou `mailto:` après la copie.
- Mise en forme : `components/RichText.tsx` (barre d'outils, raccourcis, prolongation des listes ; transformations pures sur le texte et la sélection) et `components/Markdown.tsx` (rendu, cases cliquables). Le balisage léger est retiré ou converti par `plain()` (API) et `plainText()` (compte rendu texte), converti en HTML d'e-mail à styles en ligne par `mdToHtml()` (`lib/reportHtml.ts` : `meetingReportHtml()` et `copyRich()`, qui pose `text/html` et `text/plain` dans le presse-papiers, avec repli par sélection et copie), et converti en segments mis en forme par `runs()` (PowerPoint).

## WiBridge

WiBridge partage l'API, la base, Resend et le dépôt de WacMan. Spécification : `docs/SPECIFICATION_WIBRIDGE.md`. Dans le code, « PROVIDER » désigne Wifirst (libellé `provider_name` du client) et « CLIENT » le client (`client_name`).

### Code

| Emplacement | Rôle |
|---|---|
| `packages/core/src/bridge/common.ts` | droits (`partiesOf`, `effectiveAccess`, `buildBridgeCtx`), règles du client (`defaultBridgeSettings`), journal (`bridgeEvent`) |
| `packages/core/src/bridge/questions.ts` | droits par question (`questionPerms`), liste, détail, historique, recherche, création, modification, réponse, attribution, clôture, réouverture, message, suppression, restauration, lignes d'export |
| `packages/core/src/bridge/files.ts` | pièces jointes : dépôt, rattachement, lecture, retrait |
| `packages/core/src/bridge/auth.ts` | connexion, appareils de confiance, invitations, mot de passe oublié, profil, préférences de notification |
| `packages/core/src/bridge/admin.ts` | administration : clients, streams, règles, utilisateurs, droits, journal |
| `packages/core/src/bridge/notify.ts` | événements à notifier, destinataires, récapitulatif quotidien |
| `packages/core/src/bridge/navette.ts` | fiche navette : choix de la colonne « Nouveau statut » (`navetteStatusChoices`), lecture de cette colonne, préfixe « À traiter par » facultatif (`parseNavetteTarget`), analyse des lignes (`planNavette`), application par les services de questions avec l'origine « navette » (`applyNavette`) |
| `apps/api/src/bridge/routes.ts` | routes `/api/bridge/*` |
| `apps/api/src/bridge/session.ts` | cookies et jetons WiBridge |
| `apps/api/src/bridge/mail.ts` | e-mails (gabarits, envoi Resend, boîte d'envoi de développement) ; `noAccessMail` répond à un mot de passe oublié demandé pour une adresse sans compte WiBridge actif (`bridgeStartReset` renvoie alors `noAccess`) |
| `apps/api/src/bridge/xlsx.ts` | fiche navette Excel (exceljs) : export d'un onglet (`buildNavetteWorkbook`) avec en-tête et mode d'emploi sur les lignes 1 à 4, titres de colonnes en ligne 6, questions regroupées par stream principal sous des lignes de bandeau fusionnées (couleurs `STREAM_COLORS` dans l'ordre des streams), Stream, Échéance et À traiter par centrés (`CENTERED`), échéance en texte coloré sans fond (dépassée, à moins de 7 jours), textes nettoyés par `tidy` (caractères invisibles, lignes vides et puces vides en début et en fin, trois sauts de ligne ramenés à deux), cellules « Votre réponse » et « Nouveau statut » déverrouillées avec liste de choix, titre et nom de fichier « Fiche navette <organisation Wifirst> - <organisation cliente> » sans mention de WiBridge, feuille protégée sans mot de passe, colonnes cachées ID et Version ; relecture du fichier rempli (`readNavette` : ligne de titres cherchée dans les 20 premières lignes, colonnes retrouvées par leur titre, « N° » ou « Réf. » pour le numéro, « Nouveau statut » ou « Nouvel attribué » pour la suite, lignes sans identifiant ni numéro ignorées, donc les bandeaux et les fiches d'avant la V1.6 passent) |
| `apps/api/src/bridge/scheduler.ts` | récapitulatif quotidien |
| `apps/bridge` | interface |

Le service exporte `Bridge` depuis `@wacman/core` (`import { Bridge } from "@wacman/core"`).

### Données

| Table | Contenu |
|---|---|
| `bridge_clients` | client : `slug`, `name` (nom de l'espace), `client_name`, `provider_name`, `short_name`, `emoji`, `description` (mode d'emploi), `settings` (règles), `archived`, `next_ref` (prochain numéro de question) |
| `bridge_streams` | streams du client : `name`, `emoji`, `order`, `active` |
| `bridge_members` | accès d'un utilisateur à un client : `side` (PROVIDER ou CLIENT), `default_access`, `stream_access` (droits particuliers `{stream: droit}`), `notify` (IMMEDIATE, DAILY ou NONE, NONE par défaut depuis la V1.1) ; unique par utilisateur et client |
| `bridge_questions` | `ref` (unique par client), `subject`, `body`, `asked_by_id`, `asked_by_name`, `asked_by_party`, `assigned_party`, `status` (OPEN, IN_PROGRESS, CLOSED), `due_date`, `closed_at`, `closed_by_*`, `last_activity_at`, `deleted_at` |
| `bridge_question_streams` | streams d'une question (clé double) ; la clé étrangère vers le stream empêche de supprimer un stream utilisé |
| `bridge_messages` | échanges : auteur, `party`, `body`, `outcome` (ASSIGN, CLOSE, REOPEN), `assigned_before`, `assigned_after`, `edited_at`, `source` (`navette` pour une réponse importée depuis la fiche navette), `deleted_at` et `deleted_by_name` (réponse supprimée : texte vidé, pièces jointes effacées, ligne gardée pour l'issue ; exclue des compteurs, de la recherche et de l'export) |
| `bridge_files` | pièces jointes en `bytea` (20 Mo au plus) ; `attached_at` vide pour un dépôt pas encore envoyé, purgé au bout de 24 heures |
| `bridge_events` | journal et historique : `action`, `summary`, `changes` (valeurs ou paires avant, après), auteur et organisation |
| `bridge_devices` | appareils de confiance : jeton haché (SHA-256), libellé, dernière utilisation, expiration, révocation |
| `bridge_invitations` | liens d'invitation : jeton haché, invité par, expiration, acceptation, révocation |
| `bridge_jobs` | verrou d'envoi du récapitulatif (`name`, `day`) |

### Droits

- `buildBridgeCtx(user, client)` charge le client (slug ou identifiant), l'adhésion de l'utilisateur et les streams ; il refuse un client sans adhésion ou archivé, sauf pour le super-administrateur. `ctx.access(stream)` donne le droit effectif : droit particulier du stream, sinon droit par défaut ; BOTH pour le super-administrateur.
- `questionPerms(ctx, question, streams, nombreDeMessages)` calcule `edit`, `streams`, `respondAs`, `close`, `reopenAs`, `reassign`, `delete` et `restore` à partir des organisations permises sur les streams de la question et des règles du client. La liste et le détail renvoient ces droits à l'écran ; chaque écriture recharge la question verrouillée (`SELECT … FOR UPDATE`) et les recalcule.
- Une question dont aucun stream n'est visible pour l'utilisateur répond 404.

### Sessions et authentification

- Cookie `wib_session` : JWT HS256 de 14 jours signé avec `SESSION_SECRET`, `typ: "bridge"` (la session WacMan porte `typ: "session"` : chaque application refuse le jeton de l'autre) et `session_version`. À chaque requête : compte actif, mot de passe choisi, accès WiBridge ou super-administrateur.
- `server.ts` : une requête `/api/bridge/*` n'est résolue que par `resolveBridgeUser`, jamais par la session ou un jeton WacMan ; les routes WacMan ignorent la session WiBridge.
- Appareil de confiance : cookie `wib_device` (jeton aléatoire haché en base, chemin `/api/bridge/auth`, 180 jours glissants). Sans appareil valable, la connexion envoie un code (`login_challenges`, BRIDGE_LOGIN).
- Invitation : jeton aléatoire de 32 octets haché en base, lien `<BRIDGE_WEB_URL>/invitation#<jeton>` ; la page lit le fragment, le retire de l'adresse et l'envoie dans le corps de `invitation/info` et `invitation/accept`. Le compte invité a un mot de passe aléatoire et `password_set` faux jusqu'à l'activation.
- Pièces jointes : `GET /api/bridge/auth/upload-token` délivre un jeton de 15 minutes (`typ: "upload"`), accepté seulement sur `POST /api/bridge/c/:client/files`, appelé en direct sur Railway pour que les fichiers volumineux ne passent pas par le relais Vercel (CORS ouvert aux origines de `BRIDGE_WEB_ORIGINS`). Le fichier arrive en `application/octet-stream`, nom dans `X-File-Name` (encodé), type dans `X-File-Type`. Téléchargement : `GET /api/bridge/c/:client/files/:id/link` renvoie un jeton signé de 5 minutes servi par `GET /api/bridge/dl/:jeton` (adresse masquée dans les journaux ; `routerOptions.maxParamLength` porté à 2048).

### Routes (apps/api/src/bridge/routes.ts)

| Groupe | Routes |
|---|---|
| Connexion et compte | `POST /api/bridge/auth/login`, `verify`, `logout`, `forgot`, `reset`, `password`, `invitation/info`, `invitation/accept` ; `GET` et `PATCH /api/bridge/auth/me` ; `GET /api/bridge/auth/devices`, `DELETE devices/:id`, `POST devices/revoke-all` ; `GET upload-token` |
| Client | `GET /api/bridge/c/:client` (client, streams, droits, préférences), `POST /api/bridge/c/:client/notify`, `GET search?q=`, `GET export.xlsx?status=&assigned=&stream=` (fiche navette), `POST navette/preview` (fichier en `application/octet-stream`, 5 Mo au plus), `POST navette/apply` |
| Questions | `GET` et `POST /api/bridge/c/:client/questions` (`?deleted=1` pour la corbeille) ; `GET`, `PATCH`, `DELETE questions/:id` (identifiant ou numéro) ; `POST questions/:id/messages`, `assign`, `close`, `reopen`, `restore` ; `GET questions/:id/history` ; `PATCH` et `DELETE messages/:id` |
| Pièces jointes | `POST /api/bridge/c/:client/files?questionId=&messageId=`, `GET files/:id/link`, `DELETE files/:id`, `GET /api/bridge/dl/:jeton` |
| Administration | `GET` et `POST /api/bridge/admin/clients`, `PATCH clients/:id`, `POST clients/:id/streams`, `POST clients/:id/streams/reorder`, `PATCH` et `DELETE streams/:id`, `GET` et `POST users`, `PATCH users/:id`, `PUT users/:id/memberships`, `POST users/:id/invite`, `POST users/:id/revoke-devices`, `GET journal` |
| Développement | `GET /api/bridge/dev/outbox`, `POST /api/bridge/dev/digest` (absentes en production) |

Limites : connexion 8 par tranche de 10 minutes par IP et e-mail et 20 par 30 minutes par e-mail, code 20 par IP, mot de passe oublié 6 par IP et 4 par e-mail, invitation 30 par IP, dépôts 200 par heure et par utilisateur, fiche navette 60 aperçus et 30 imports par heure et par utilisateur.

### Notifications

- Le service émet un `BridgeNotice` (`emitBridgeNotice`, après la transaction, sans jamais faire échouer l'opération) ; l'API branche l'envoi au démarrage (`Bridge.setBridgeNotifier(sendNotice)`).
- `noticeRecipients` : membres du client avec la préférence IMMEDIATE, compte actif et activé, ayant l'accès WiBridge (ou super-administrateur), sauf l'auteur ; pour une attribution, les éditeurs de l'organisation attributaire sur l'un des streams de la question ; pour une clôture ou une réponse qui conserve l'attribution, la personne qui a posé la question.
- Récapitulatif : `startBridgeScheduler` vérifie toutes les 5 minutes ; du lundi au vendredi entre 8 h et 12 h (Paris), l'insertion de la ligne `bridge_jobs (digest, jour)` réserve l'envoi du jour à une seule instance ; `digestBatches` regroupe par membre (préférence DAILY) les questions ouvertes attribuées à une organisation pour laquelle il est éditeur.
- Envoi par Resend (envoi groupé par 100) avec l'expéditeur `BRIDGE_MAIL_FROM` ; en développement sans clé Resend, les e-mails sont gardés en mémoire et numérotés (`GET /api/bridge/dev/outbox?after=<n>`).

### Interface (apps/bridge)

- Pages : `/login` (mot de passe, code de nouvel appareil, mot de passe oublié), `/invitation`, `/` (choix du client, redirection directe s'il n'y en a qu'un), `/c/[slug]` (questions), `/compte`, `/admin` (super-administrateur).
- Fiche navette : boutons « Fiche navette » (téléchargement de l'export avec les filtres de l'écran) et « Importer » (champ fichier caché) dans `app/c/[slug]/page.tsx` ; `components/questions/NavetteImport.tsx` envoie le fichier à `navette/preview`, affiche l'aperçu ligne par ligne, puis appelle `navette/apply` avec les lignes retenues (l'API les analyse de nouveau avant d'écrire).
- Repris de WacMan : `RichText.tsx`, `Markdown.tsx`, `Tag.tsx` (avec options désactivées et minimum de valeurs), `ui.tsx` (InlineText, Modal, Toggle, useSubmit, messages), `Menu.tsx`, `lib/markup.ts` (copie identique), charte et thèmes de `globals.css`.
- `components/ClientContext.tsx` : données du client et actions sur les questions (`useQuestionActions`), qui mettent à jour la liste et le détail sans attendre le rafraîchissement.
- `components/questions/` : étiquettes (`Tags.tsx`, dont `DueTag` pour l'échéance), échanges et zone de réponse (`Thread.tsx` : `QuestionFields`, en tête de la question dépliée, avec sujet, statut, attribution, échéance et streams modifiables ; `MessageItem` avec le menu « ⋯ » Modifier ou Supprimer, `InlineText` passé en saisie par `editRequest` ; brouillons gardés en mémoire par question), pièces jointes (`Attachments.tsx`, envoi XHR avec progression), historique (`History.tsx`), nouvelle question (`NewQuestion.tsx`) ; `components/admin/Rights.tsx` : éditeur des droits par client et par stream.
- Une seule question dépliée à la fois : `toggle` (`app/c/[slug]/page.tsx`) remplace l'ensemble des questions ouvertes par la seule question dépliée ; un `useLayoutEffect` corrige le défilement pour que la ligne cliquée garde sa position quand une question plus haut se replie (Safari ne gère pas l'ancrage du défilement).
- Déplier au clic : `expandOnClick` (`app/c/[slug]/page.tsx`), en phase de capture sur la ligne ou le haut de la carte, déplie une question repliée ; les boutons qui plient et déplient portent `data-row-toggle` ; sur le sujet et le texte (`data-expand-only`), l'événement est arrêté pour ne pas passer en saisie au premier clic.
- Tableau en `table-layout: fixed` avec `colgroup` (colonnes de largeur fixe, sujet extensible), tri par en-tête, cartes sous 1 200 px de large (`useSyncExternalStore` sur `matchMedia`, une seule mise en page rendue), filtres mémorisés dans `localStorage` (`wibridge-view-<client>`), thème dans `wibridge-theme`.
- `lib/api.ts` : appels relatifs `/api/*` (relais Vercel vers Railway, cookie sur le domaine du front), redirection vers `/login?next=` sur 401 ; `lib/upload.ts` : dépôt direct sur `NEXT_PUBLIC_API_URL` et ouverture des fichiers.

## Migrations

Générées par `npm run db:generate -w @wacman/core` (drizzle-kit) dans `packages/core/drizzle/`, appliquées automatiquement au démarrage de l'API. `0000_init` (V1), `0001_tokens_reset` (V1.1 : table `api_tokens`, colonne `login_challenges.purpose`), `0002_card_start_planning` (V1.2 : colonne `cards.start_date` et ajout des blocs ALERT_CARDS et PLANNING aux types de séance à faits marquants), `0003_card_freshness` (V1.3 : colonne `cards.content_updated_at`, initialisée depuis `updated_at`, puis dates « Mis à jour » Notion pour le compte La Poste, sauf modification WacMan plus récente au journal), `0004_actions_decisions` (V1.5 : tables `actions` et `decisions`, blocs ACTIONS et DECISIONS ajoutés aux types existants, décisions reprises des lignes « Décision : … » des sujets, relevé du COPROJ LP du 01/10/2026 et réglages d'e-mail du COPROJ LP pour le compte La Poste, chaque reprise ne s'appliquant qu'une fois), `0005_bridge` (WiBridge : colonnes d'accès de `users`, tables `bridge_*`, client La Poste avec ses 7 streams s'il n'existe aucun client, accès WiBridge du super-administrateur, éditeur des deux chez La Poste), `0006_bridge_notify_default` (préférence d'e-mail NONE par défaut, accès existants passés à NONE), `0007_bridge_message_delete` (colonnes `deleted_at` et `deleted_by_name` des messages), `0008_bridge_message_source` (colonne `source` des messages), uniquement des ajouts.

## Pourquoi Drizzle plutôt que Prisma

Drizzle est entièrement en JavaScript : ni binaire de moteur à télécharger au build, ni dépendance à un hôte externe. Le build est le même partout (poste local, Railway, environnement de développement de Claude).
