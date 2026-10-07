# WacMan

**Wifirst Account Management** : application web de pilotage des comptes clients de Wifirst (premier compte : La Poste - PSTNG).

- Comptes clients configurables (streams, sprints, listes de valeurs, types de séance, comitologie, textes).
- Section Program Management : tableau de bord, kanban par statut et par sprint, Program weekly (faits marquants éditables, cartes en alerte, planning Gantt par stream), séances (COPROJ, Strategic Committee…) avec compte rendu à copier ou en PDF, risques et arbitrages, gouvernance, journal.
- Paramétrage directement dans les écrans et mise en forme des textes (gras, italique, listes, cases, liens…).
- Recherche globale (Ctrl+K), insensible aux accents.
- Sections Finance management et Provisioning management (à venir).
- Connexion par mot de passe et code e-mail, mot de passe oublié, rôles par compte, commentaires et historique.
- Exports PowerPoint au gabarit Wifirst et Excel.
- Assistant Claude intégré pour consulter et modifier le contenu en langage naturel.
- Connecteur Claude (serveur MCP) et API REST par jetons d'accès personnels.
- Application installable sur mobile.

## WiBridge

**WiBridge** (`apps/bridge`, https://wibridge-wifirst.vercel.app) est l'espace d'échange entre Wifirst et ses clients (premier client : La Poste) : questions et demandes d'éléments attribuées tour à tour à l'une ou l'autre organisation, réponses, clôture et réouverture, historique, droits par stream, pièces jointes, e-mails de notification, export Excel. Interface séparée, même API et même base que WacMan, comptes distincts (sauf le super-administrateur).

## Documentation

- [Spécification fonctionnelle de WacMan](docs/SPECIFICATION.md) (avec le journal des évolutions)
- [Spécification fonctionnelle de WiBridge](docs/SPECIFICATION_WIBRIDGE.md)
- [Architecture technique](docs/ARCHITECTURE.md)
- [Exploitation : hébergement, variables, déploiement, données](docs/EXPLOITATION.md)
- [Passation : reprendre le développement depuis un autre compte Claude](docs/PASSATION.md) (et [CLAUDE.md](CLAUDE.md))
- [Tests de non-régression](tests/README.md)

## Démarrage rapide

```bash
npm install
npm run dev:api      # API sur http://localhost:4000
npm run dev:web      # WacMan sur http://localhost:3000
npm run dev:bridge   # WiBridge sur http://localhost:3001
```

Pile : Next.js 15 (Vercel, Paris), Fastify 5 + Drizzle ORM + PostgreSQL 16 (Railway, Amsterdam), Resend, API Claude.
