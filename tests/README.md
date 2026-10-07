# Tests de WacMan et WiBridge

Suites de non-régression rejouées avant chaque mise en ligne. Elles tournent contre une instance **locale** (API sur le port 4000, front WacMan sur le port 3000, front WiBridge sur le port 3001, faux serveur Claude sur le port 4900), jamais contre la production.

## Préparer l'environnement (une fois par machine ou par session cloud)

1. Outils : Node 20 ou plus, PostgreSQL 16, Python 3 avec `pip install --break-system-packages playwright python-pptx python-docx openpyxl`, et Chromium pour Playwright (déjà présent dans les sessions Claude Code dans le cloud ; sinon `python3 -m playwright install chromium`). LibreOffice et `pdftoppm` servent seulement à regarder les slides PowerPoint en image.
2. `bash tests/dev_up.sh` : démarre PostgreSQL, crée au besoin la base `wacman` et le fichier `apps/api/.env.dev` (compte local `florent@omgt.fr`, mot de passe local tiré au hasard, jamais affiché), installe les dépendances, lance le faux serveur Claude, l'API et les deux fronts (build si nécessaire).
3. Données : les suites WacMan travaillent sur le compte `la-poste-pstng` (les suites WiBridge créent leurs propres données et n'en ont pas besoin). Les données client ne sont pas versionnées. Importer la sauvegarde JSON du compte (WacMan en production, Paramètres du compte, Données, « Sauvegarde complète du compte », fichier fourni par Florent) :
   ```bash
   npm run build:api
   set -a; . apps/api/.env.dev; set +a
   node apps/api/dist/cli/import.js chemin/vers/sauvegarde.json florent@omgt.fr
   ```

## Lancer

```bash
bash tests/run_all.sh                     # toutes les suites (environ 10 minutes)
bash tests/run_all.sh api_v15.py e2e_v15.py   # quelques suites
bash tests/run_all.sh bridge_api.py bridge_e2e.py   # WiBridge seul
```

Chaque suite affiche `RESULT: ALL OK` ou `RESULT OK` quand tout passe ; le détail est dans `tests/out/<suite>.log` et les captures d'écran dans `tests/out/shots/`. L'API est relancée avant chaque suite pour remettre à zéro les limites de tentatives de connexion.

| Suite | Contenu |
|---|---|
| `api_test.py` | tableau de bord, recherche, duplication, mot de passe oublié, jetons, MCP |
| `api_fix.py` | correctifs de la V1.4 : droits des jetons, contrôles de dates et de références, export puis réimport complet, MCP robuste, codes simultanés |
| `e2e_v12.py` | kanban par statut et par sprint, Program weekly, planning |
| `e2e_features.py` | mode édition, étiquettes, menu rétractable |
| `e2e_assistant.py` | assistant Claude (faux serveur) |
| `e2e_fresh.py` | étiquette de fraîcheur des cartes |
| `e2e_cr.py` | « Copier le CR » en HTML |
| `e2e_tour.py` | tour de tous les écrans en sombre, clair, mobile et lecteur ; exports |
| `api_v15.py` | actions, décisions, quoi de neuf, revues, import de CR, faits marquants proposés, slides des decks, réimport |
| `e2e_v15.py` | les mêmes fonctions dans le navigateur, impression, mobile |
| `bridge_api.py` | WiBridge par l'API : invitation, appareils de confiance, séparation des comptes et des sessions avec WacMan, droits par stream et règles du client, questions, réponses et issues, réouverture, historique, pièces jointes, e-mails, récapitulatif, export Excel, administration |
| `bridge_e2e.py` | WiBridge dans le navigateur : connexion et code, invitation, tableau (question dépliée par un clic sur la ligne, édition en place, tri, filtres, recherche), réponse modifiée puis supprimée par son auteur, échanges côté Wifirst et côté client, lecteur, mobile, thème clair, historique, administration, mon compte, export, pièces jointes, lien direct |

Outils : `restart_api.sh` (relance l'API en `tsx watch`), `rebuild_web.sh` (build du front WacMan avec contrôle des types et du lint, puis relance sur le port 3000), `rebuild_bridge.sh` (même chose pour WiBridge, port 3001), `mock-anthropic.mjs` (faux serveur de l'API Messages : réponses en flux pour l'assistant, réponses à outil imposé pour l'import de CR et les faits marquants).

À savoir : `tsx watch` applique tout seul une nouvelle migration dès son enregistrement ; si on ajoute ensuite des requêtes de données au même fichier, il faut les jouer à la main en local avec `psql` (la production joue le fichier complet au démarrage).

WiBridge en local : les e-mails ne partent pas (pas de clé Resend) et sont gardés en mémoire par l'API (`GET http://localhost:4000/api/bridge/dev/outbox`, numérotés : `?after=<n>` donne la suite d'un repère) ; les réponses de connexion et d'invitation donnent le code (`devCode`) et le lien (`devLink`). Chaque exécution de `bridge_e2e.py` crée un client « La Poste » propre (adresse `la-poste-2`, `la-poste-3`…) et l'archive à la fin.
