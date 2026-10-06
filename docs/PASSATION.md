# WacMan : dossier de passation vers un autre compte Claude

Mis à jour le 6 octobre 2026, version en ligne **V1.5** (fonctions livrées le 4 octobre 2026, commit `561a4d5`, puis la passation du 6 octobre).

Ce document rassemble tout ce qu'il faut pour reprendre le développement de WacMan depuis un autre compte Claude : le contexte, l'historique, la méthode de travail suivie jusqu'ici, les accès à ouvrir et les pièges déjà rencontrés. Il ne contient aucun secret.

Comment s'en servir :
- il est versionné dans le dépôt (`docs/PASSATION.md`), et `CLAUDE.md` à la racine demande de le lire : toute session Claude Code ouverte sur le dépôt y a donc accès ;
- le déposer aussi dans un projet Claude « WacMan » du nouveau compte, pour les conversations hors code ;
- la partie 11 liste les accès à ouvrir, et le script `tools/connect_claude_account.sh` fait avec Florent ce qui peut l'être depuis son ordinateur ;
- la partie 12 donne le message de démarrage à coller dans la première session.

---

## 1. WacMan en bref

WacMan (Wifirst Account Management) est l'application web de pilotage des comptes clients de Wifirst. Elle remplace l'espace Notion « La Poste - PSTNG » monté fin septembre 2026 pour le programme de build PST-NG, et le rend réutilisable pour d'autres clients.

- **Multi-comptes** : chaque compte client a ses streams, sprints, listes de valeurs, types de séance, comitologie, textes et accès. Premier compte : `la-poste-pstng` (« La Poste - PSTNG »).
- **Sections** d'un compte : Program Management (tout le Notion reconstruit, et plus), Finance management et Provisioning management (vides pour l'instant).
- **Utilisateurs** : 5 à 8 éditeurs et une quinzaine de lecteurs côté Wifirst ; pas d'accès La Poste pour l'instant.
- **Assistant Claude intégré** (API Claude) et **connecteur Claude** (serveur MCP) pour lire et modifier le contenu en langage naturel.

Le détail fonctionnel complet est dans `docs/SPECIFICATION.md` (avec le journal de toutes les demandes), l'architecture dans `docs/ARCHITECTURE.md`, l'hébergement dans `docs/EXPLOITATION.md`.

## 2. Florent et le contexte métier

- **Florent Jolivet**, gérant d'Overdrive Management, directeur de projet indépendant. Depuis septembre 2026, directeur de projet du build PST-NG chez Wifirst pour La Poste (compte Wifirst `florent.jolivet-ext@wifirst.fr`). Seul décideur sur WacMan. Super-administrateur WacMan : `florent@omgt.fr`.
- **PST-NG** : programme télécoms de La Poste. Wifirst construit la solution (Lots 2 et 3), découpée en **streams** : Déploiement, Technico-fonctionnel, Exploitation, Outillage Data & référentiel, Finance et TEM, Logistique, Sécurité, Gouvernance (le stream Mainteneurs Postaux a été réparti le 26/09/2026 mais reste présent dans les données).
- **Direction de projet** : Florent, avec Matthieu Roca et Thibaut Bayen (avant-ventes, en support). Porteurs : Hugo Xoual (Déploiement, Exploitation, Logistique), Robin Colin (Technico-fonctionnel), Hassan Zahid (Outillage), Matthieu Roca (Sécurité).
- **Comitologie** reprise dans WacMan comme types de séance :
  - **Program weekly** (comité projet hebdomadaire interne, lundi 14h à 15h) : faits marquants, cartes en alerte, planning ;
  - **COPROJ LP** (hebdomadaire avec La Poste, 30 minutes) : statut de chaque stream (Avancement nominal, Attente prérequis LP, Alerte), avancement, alertes et prérequis ; compte rendu envoyé par e-mail (objet « WIFIRST / PSTNG : CR COPROJ du JJ/MM/AAAA ») ;
  - **Strategic Committee** (management) : sujets, décisions ;
  - point hebdomadaire d'une heure avec chaque stream leader (d'où la page Revue de stream).
- **Sprints** calés sur les échéances La Poste : Sprint 1 jusqu'au 1er novembre 2026 (arbitrage du lancement du pilote Fast Track Lot 3), Sprint 2 jusqu'à mi-décembre, Sprint 3 jusqu'à fin février 2027 (interconnexions Lot 2), Sprint 4 jusqu'en avril 2027 (prototypes Lot 2).
- **Decks de référence** (Google Drive de Florent) : deck interne Program weekly du 28/09/2026 et deck COPROJ La Poste du 01/10/2026. Les exports PowerPoint de WacMan reprennent leur structure et leur gabarit (partie 6).

## 3. Façon de travailler avec Florent

Préférences constatées et demandées :
- **Exécution autonome** : il préfère qu'on avance sans points de validation intermédiaires quand la demande est claire, puis un compte rendu court à la fin. Poser une question seulement si un mauvais choix coûterait cher.
- **Interface en français**, **mobile d'abord**.
- **Documentation à chaque évolution** : `SPECIFICATION.md` (version, sections, ligne de journal « Date, Demande, Effet ») et `ARCHITECTURE.md`, dans le même commit que le code.
- **Vérification rigoureuse** : tout rejouer (types, build, suites de tests, rendu visuel des écrans et des slides) avant de dire que c'est fini.
- **Règles de rédaction** pour tout ce qu'il diffuse (documents, slides, libellés, e-mails générés) :
  - aucun tiret cadratin en incise ou en séparateur (parenthèses, deux-points ou virgules à la place), pas de « · » en séparateur, pas de flèche dans le texte ;
  - phrases simples, pas de formulations recherchées ni de qualificatifs qui jugent ;
  - vocabulaire du programme (build, stream, sous-stream, EB, MeC, VSR, lot, sprint, livrable).
- **Séparation des projets** : dans Vercel, Railway et Resend, WacMan a ses propres projets, distincts de turbolife, TurboAgenda et Flogger Forge (projets personnels de Florent sur les mêmes comptes). Ne jamais les modifier.
- **Secrets** : Florent saisit lui-même clés API et mots de passe. Ne jamais en afficher ni en écrire dans le dépôt.
- **Pratique suivie jusqu'ici pour livrer** : une fois les tests au vert, commit sur `main` (message en français, titre « WacMan Vx.y : … » puis le détail) et push, ce qui déploie ; puis vérification des déploiements et un message final court (ce qui est livré, ce qui a été repris en données, les limites).

## 4. Où tout se trouve

| Élément | Valeur |
|---|---|
| Dépôt | GitHub privé `OverdriveManagement/wacman`, branche `main` |
| Front | https://wacman.vercel.app (Vercel, projet `wacman`, identifiant `prj_jAcPBrMQB7OHlPrdy3l13JlQjMrF`, équipe Flogger Forge, offre Hobby, région Paris cdg1, répertoire racine `apps/web`) |
| API | https://wacman-api-production.up.railway.app (santé : `/api/health`) |
| Railway | compte overdrivemanagement, offre Hobby ; projet `wacman` `15e94573-4edc-46ba-b699-a06c089fd51d`, environnement production `0fbe2d06-50a9-4513-84a7-6619a341ea1f`, service `wacman-api` `3e922a2b-5e30-4178-8881-079de250bab7`, plus un service PostgreSQL ; région Amsterdam (europe-west4) |
| Serveur MCP | `https://wacman-api-production.up.railway.app/api/mcp` (en-tête `Authorization: Bearer wac_…`) ou `…/api/mcp/wac_…` pour un connecteur personnalisé |
| E-mails | Resend, domaine `omgt.fr` vérifié, expéditeur `WacMan <wacman@omgt.fr>`, clé dédiée « wacman » |
| Claude | clé API Anthropic du compte Overdrive Management (variable Railway), modèle par défaut `claude-sonnet-5-5` |
| Secrets | uniquement dans les variables du service Railway (`DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`…) ; rien à transmettre au nouveau compte |
| Données client | jamais versionnées (`data/*.json` est ignoré) ; sauvegarde JSON téléchargeable dans WacMan (Paramètres du compte, Données) |

Avec le connecteur Vercel, passer l'identifiant du projet : la portée par le nom d'équipe (`flogger-forge`) a renvoyé une erreur 403.

## 5. Architecture en une page

- **Monorepo npm** : `packages/core` (schéma Drizzle ORM, migrations SQL jouées au démarrage de l'API, registre des entités, services métier), `apps/api` (Fastify 5, assistant, MCP, exports pptxgenjs et exceljs), `apps/web` (Next.js 15 App Router, React 19, Tailwind 4, SWR, dnd-kit).
- **Registre des entités** (`packages/core/src/entities.ts`) : chaque entité éditable (carte, séance, fait marquant, statut, sujet, risque, action, décision, stream, sprint…) y est décrite une fois (schéma zod, rôle requis, contrôles de références). Routes REST génériques `/api/accounts/:compte/e/:entité`, outils de l'assistant et serveur MCP passent tous par là : mêmes droits, même validation, même journal (diff `{champ: [avant, après]}`).
- **Droits** : rôles par compte (Administrateur, Éditeur, Lecteur), super-administrateur ; jetons d'accès personnels `wac_…` (lecture seule possible) pour l'API et le MCP.
- **Front** : appels `/api/*` relayés par Vercel vers Railway (même origine, cookie de session) ; l'assistant appelle Railway en direct avec un jeton court.
- **Balisage léger** des textes (`markup.ts`, copie identique dans core et web, vérifiée par `tools/check_markup_sync.sh`) repris à l'écran, dans le CR copié, le PDF, Excel et PowerPoint.

## 6. Historique

| Date | Version | Contenu principal |
|---|---|---|
| 03/10/2026 | V1 (`6394431`) | comptes clients, Program Management repris du Notion, exports, assistant Claude, connexion par mot de passe et code e-mail |
| 03/10/2026 | mise en ligne (`fe5fc7e`) | Vercel (Paris) et Railway (Amsterdam) reliés au dépôt, push sur `main` qui déploie |
| 04/10/2026 | `c37670c` | assistant fiabilisé, erreurs d'affichage isolées |
| 04/10/2026 | V1.1 (`08ace7e`) | tableau de bord, recherche Ctrl+K, jetons d'accès, connecteur MCP, application installable |
| 04/10/2026 | V1.2 (`f1b2197`) | kanban par statut et par sprint, Program weekly distinct, planning Gantt, paramétrage dans les écrans, barre de mise en forme |
| 04/10/2026 | V1.3 (`050acee`) | mode édition, étiquettes cliquables, menu rétractable, étiquette de fraîcheur des cartes (dates Notion reprises) |
| 04/10/2026 | `d1776c2` | « Copier le CR » en HTML sur le modèle du CR COPROJ envoyé dans Gmail |
| 04/10/2026 | V1.4 (`bed5ce3`) | revue générale, environ 40 correctifs, suites de tests |
| 04/10/2026 | V1.5 (`561a4d5`) | relevé des actions et registre des décisions, e-mail complet du CR, quoi de neuf et faits marquants proposés par Claude, revue de stream avec mode présentation, bilan de sprint, import d'un CR d'atelier, PowerPoint au format des decks Program weekly et COPROJ |
| 06/10/2026 | passation | ce document, `CLAUDE.md`, suites de tests versionnées dans `tests/`, script `tools/connect_claude_account.sh` ; correctif : un jeton en lecture seule d'un super-administrateur voit de nouveau tous les comptes dans `list_accounts` |

Données reprises en production par les migrations : dates « Mis à jour » Notion des cartes La Poste (0003) ; 7 actions du COPROJ LP du 01/10/2026, 4 décisions du Strategic Committee du 29/09/2026 tirées des sujets, réglages d'e-mail du COPROJ LP (0004).

Points ouverts à la V1.5 :
- les slides suivent le texte des decks et le gabarit relevé, pas encore leur rendu exact : pour caler au pixel près, Florent peut fournir les fichiers .pptx d'origine ;
- le type COPROJ LP n'a pas de bloc Décisions (il n'a pas de sujets) : s'ajoute en mode édition si besoin ;
- l'import de CR d'atelier et les faits marquants proposés n'ont été testés qu'avec un faux serveur Claude ; les premiers vrais appels se font en production ;
- le script racine `npm run db:migrate` pointe vers un script inexistant (les migrations se jouent au démarrage de l'API, il n'est pas nécessaire).

## 7. Méthode pour une évolution

1. Lire la demande, `SPECIFICATION.md` (sections concernées et journal) et le code concerné.
2. Données : modifier `packages/core/src/schema.ts`, générer la migration (`npm run db:generate -w @wacman/core`), y ajouter à la main la reprise de données si besoin (une reprise ne doit s'appliquer qu'une fois : `WHERE NOT EXISTS`, `NOT (settings ? 'clé')`…). Les migrations ne font que des ajouts.
3. Nouvelle entité éditable : la déclarer dans `entities.ts` (schéma, rôle, contrôles de références), l'ajouter à l'export et l'import de compte (`services/transfer.ts`), au prompt de l'assistant (`apps/api/src/assistant/run.ts`).
4. Vérifier : types des trois paquets, `tools/check_markup_sync.sh`, `bash tests/rebuild_web.sh` (build Next avec lint), `bash tests/run_all.sh` ; ajouter une suite ou des cas pour la nouveauté ; regarder les écrans touchés en capture (ordinateur et mobile 390 px) et, pour PowerPoint, rendre les slides en image (LibreOffice puis `pdftoppm`).
5. Documenter : `SPECIFICATION.md` (version, sections, ligne de journal), `ARCHITECTURE.md`, `EXPLOITATION.md` si besoin.
6. Livrer : commit et push sur `main`, puis contrôler le déploiement Railway du service `wacman-api` (SUCCESS, journaux de démarrage sans erreur, migration appliquée) et Vercel (READY).

## 8. Environnement de test

Tout est décrit dans `tests/README.md`. En bref : `bash tests/dev_up.sh` (PostgreSQL, base locale, `.env.dev` avec un mot de passe local tiré au hasard, faux serveur Claude, API, front), import de la sauvegarde JSON du compte La Poste fournie par Florent, puis `bash tests/run_all.sh` (10 suites, environ 10 minutes, toutes au vert au 06/10/2026). Les tests ne visent jamais la production.

## 9. Pièges déjà rencontrés

- `tsx watch` (API en développement) applique une nouvelle migration dès qu'elle est enregistrée : les requêtes de reprise ajoutées ensuite au même fichier doivent être jouées à la main en local avec `psql`.
- Ne jamais lancer `pkill -f` ou `pgrep -f` avec un motif qui figure dans sa propre ligne de commande : cela tue le shell en cours.
- Un processus lancé en arrière-plan depuis un outil doit avoir ses entrées et sorties redirigées (`> fichier 2>&1 < /dev/null &`), sinon l'outil attend sans fin.
- Les connexions sont limitées en nombre (par IP et par e-mail) : relancer l'API entre deux suites (ce que fait `run_all.sh`).
- Fastify refuse une requête DELETE avec `Content-Type: application/json` et un corps vide (400).
- Playwright : les cases à cocher contrôlées (enregistrées puis rafraîchies) se cliquent avec `click()`, pas `check()` ; les étiquettes ont un `aria-label` du type « Statut de la décision : Prise » ; les lignes d'actions et de décisions portent `data-action-id` et `data-decision-id` ; les champs date se remplissent avec `fill()` en AAAA-MM-JJ.
- Pas de prettier : le dépôt n'a pas de configuration, il reformaterait les fichiers.
- Les journaux Railway affichent « npm warn config production » au niveau erreur : sans conséquence.
- Exports PowerPoint : gabarit 16:9 (10 x 5,625 pouces), titres Hind Madurai gras 20 pt `004968`, chapô Inter 8 pt `334155`, intertitres Inter ExtraBold 7,5 pt `2563EB` avec filet `F1F5F9`, palette bleu `2563EB`, bleu clair `9DBDF4`, ocre `D97706`, teal `0F766E`, rouge `EF4444`, fond de carte `F8FAFC`, mention de confidentialité Hind Madurai Light 6 pt `A6AAA9`.

## 10. Évolutions gardées pour plus tard

Liste établie avec Florent le 04/10/2026 (non commencée) :
1. Bascule finale depuis Notion : dernier import, Notion en lecture seule, mise à jour de la compétence Claude « seance-pstng-depuis-precedente » qui cible encore Notion.
2. Relance du vendredi par e-mail aux porteurs des cartes non mises à jour, avant le Program weekly.
3. Historique de la météo des streams (statut COPROJ LP par stream au fil des séances).
4. Suivi des prérequis La Poste (demandé le, attendu le, relances, levé le, compteur de retard).
5. Jalons client datés (15/10 décision pilote, 6/11 option, fin du Sprint 1, comité de pilotage début novembre) sur le planning, le tableau de bord (compte à rebours) et les exports.
6. Rôle « client » en lecture seule pour La Poste (COPROJ LP, jalons, prérequis seulement).
7. Import du Backlog Build Wifirst (361 éléments) relié aux cartes.
8. Liens vers les documents Drive sur les cartes (version, classification C2).
9. Charge par porteur et par sprint, avec alerte de surcharge.
10. Provisioning, premier usage : pilote Fast Track Lot 3 (99 sites dont 50 Wifirst, macro-statuts du classeur de déploiement v4, stock de boîtiers NM11P, import CSV).
11. Finance, premier usage : catalogue d'UO de la BAFO, commandes La Poste par lot, hypothèses de coût (Aruba, 4G, 150 boîtiers), marge et facturation (à cadrer avec Florent).
12. Hébergement : Vercel Pro, crédit Railway, question à la DSI Wifirst sur les données C2 hébergées sur ses comptes, SSO Microsoft.
13. Sauvegarde automatique quotidienne avec test de restauration.
14. Tests automatiques à chaque push et environnement de recette.
15. Domaine personnalisé.

## 11. Connexions à établir pour le nouveau compte Claude

Le script `tools/connect_claude_account.sh`, lancé par Florent sur son ordinateur, guide toutes ces étapes, invite au besoin un autre identifiant GitHub sur le dépôt et teste le jeton WacMan. Les autorisations elles-mêmes (OAuth, installation d'application GitHub, ajout de connecteurs) se donnent dans le navigateur par Florent : aucun outil ne peut les accorder à sa place.

| Accès | Pourquoi | Indispensable | Qui le fait |
|---|---|---|---|
| Dépôt GitHub `OverdriveManagement/wacman` | lire, modifier et pousser le code | oui | Florent (invitation si autre identifiant GitHub) |
| Application GitHub Claude sur l'organisation OverdriveManagement | Claude Code dans le navigateur ne voit un dépôt privé qu'avec elle | oui | Florent, propriétaire de l'organisation GitHub |
| Claude Code (claude.ai/code) relié à GitHub, environnement Default | sessions de développement dans le cloud | oui | Florent, dans le nouveau compte |
| Connecteur Railway | état des déploiements, journaux, variables | oui pour vérifier les mises en ligne | Florent (connexion avec son compte Railway) |
| Connecteur Vercel | état des déploiements du front, domaines | oui pour vérifier les mises en ligne | Florent (connexion avec son compte Vercel) |
| Connecteur WacMan (MCP) | lire et modifier le contenu des comptes en langage naturel | non pour le code | Florent (jeton créé dans WacMan) |
| Notion, Gmail, Google Drive | ancien espace Notion, CR envoyés, decks de référence | non | Florent |
| Projet Claude « WacMan » | garder ce document et les échanges hors code | conseillé | Florent |

### 11.1 GitHub
- Si le nouveau compte Claude utilise le même identifiant GitHub que Florent : rien à faire sur le dépôt.
- Sinon : inviter cet identifiant sur le dépôt avec le droit d'écriture (le script le fait avec `gh`), puis l'accepter depuis le compte invité.
- Installer l'application GitHub Claude (https://github.com/apps/claude/installations/new) sur l'organisation `OverdriveManagement`, avec accès au dépôt `wacman`.

### 11.2 Claude Code dans le cloud
- Dans le nouveau compte : https://claude.ai/code, « Sign in with GitHub », puis environnement **Default** (réseau Trusted). Il suffit : npm, PyPI, GitHub et les dépôts Ubuntu sont autorisés, PostgreSQL 16 est préinstallé. Aucune variable d'environnement n'est nécessaire, et il ne faut y mettre aucun secret (les variables d'un environnement sont lisibles par ceux qui l'utilisent).
- Script d'installation facultatif pour l'environnement : `npm ci && pip install --break-system-packages playwright python-pptx python-docx openpyxl`.
- Sur une offre Team ou Enterprise (par exemple une organisation Claude Wifirst) : un propriétaire de l'organisation doit d'abord activer le connecteur GitHub (Admin settings, Connectors), et le siège doit inclure Claude Code.

### 11.3 Connecteurs Railway et Vercel
- Customize, Connectors : ajouter Railway et Vercel, puis se connecter avec les comptes de Florent qui portent les projets `wacman`.
- Sur Team ou Enterprise : un propriétaire les active pour l'organisation, puis chaque membre se connecte avec son propre compte.
- Contrôle : demander au nouveau Claude de lister les déploiements du service `wacman-api` (projet Railway `15e94573-…`) et du projet Vercel `prj_jAcPBrMQB7OHlPrdy3l13JlQjMrF`.

### 11.4 Connecteur WacMan (contenu)
- Dans WacMan : menu utilisateur, « Connecteur Claude et jetons », créer un jeton dédié (par exemple « Claude Wifirst »), en lecture seule si les modifications ne doivent passer que par l'écran.
- Offre individuelle (Pro, Max) : Customize, Connectors, « + Add », « Add custom connector », nom « WacMan », adresse `https://wacman-api-production.up.railway.app/api/mcp/<jeton>`, authentification « No sign in ».
- **Attention sur une offre Team ou Enterprise** : un connecteur personnalisé y est ajouté par un propriétaire pour toute l'organisation. Comme l'adresse contient le jeton, tous les membres qui s'y connectent agiraient avec les droits de Florent. Dans ce cas, préférer un jeton en lecture seule, ou ne pas ajouter ce connecteur à l'organisation. Un jeton se révoque à tout moment dans WacMan et cesse aussitôt de fonctionner.

### 11.5 Données pour les tests
- Télécharger dans WacMan la sauvegarde complète du compte La Poste (Paramètres du compte, Données) et la joindre à la session quand elle doit lancer les tests. Elle contient des données client : ne pas la verser dans le dépôt.

### 11.6 Ce qui ne se transmet pas
- La mémoire de l'ancien compte Claude et ses projets ne passent pas d'un compte à l'autre : ce document les remplace.
- Les secrets de production restent dans Railway. Le nouveau compte n'a besoin ni de la clé Anthropic, ni de la clé Resend, ni du mot de passe de Florent.

## 12. Message de démarrage à coller dans la première session

> Tu reprends le développement de WacMan, dépôt OverdriveManagement/wacman. Lis d'abord CLAUDE.md puis docs/PASSATION.md, docs/SPECIFICATION.md et docs/ARCHITECTURE.md. Vérifie ensuite les accès sans rien modifier : (1) le dépôt est cloné et tu peux pousser une branche de test que tu supprimes aussitôt ; (2) connecteur Railway : derniers déploiements du service wacman-api (projet 15e94573-4edc-46ba-b699-a06c089fd51d) ; (3) connecteur Vercel : derniers déploiements du projet prj_jAcPBrMQB7OHlPrdy3l13JlQjMrF ; (4) si le connecteur WacMan est présent : list_accounts. Monte ensuite l'environnement local avec tests/dev_up.sh, importe la sauvegarde JSON jointe et lance tests/run_all.sh. Fais-moi un compte rendu court de ce qui marche et de ce qui manque.
