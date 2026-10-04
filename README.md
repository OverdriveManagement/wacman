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

## Documentation

- [Spécification fonctionnelle](docs/SPECIFICATION.md) (avec le journal des évolutions)
- [Architecture technique](docs/ARCHITECTURE.md)
- [Exploitation : hébergement, variables, déploiement, données](docs/EXPLOITATION.md)

## Démarrage rapide

```bash
npm install
npm run dev:api   # API sur http://localhost:4000
npm run dev:web   # interface sur http://localhost:3000
```

Pile : Next.js 15 (Vercel, Paris), Fastify 5 + Drizzle ORM + PostgreSQL 16 (Railway, Amsterdam), Resend, API Claude.
