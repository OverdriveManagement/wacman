# WacMan : spécification fonctionnelle

WacMan (Wifirst Account Management) est l'application web de pilotage des comptes clients de Wifirst. Elle remplace l'espace Notion « La Poste - PSTNG » monté en septembre 2026 et le rend réutilisable pour d'autres clients.

Ce document décrit ce que fait l'application. Il est mis à jour à chaque évolution ; le journal en fin de document trace les demandes, prompt par prompt.

Version courante : **V1** (octobre 2026).

---

## 1. Principes

- **Multi-comptes** : chaque client est un compte (La Poste est le premier). Toute donnée appartient à un compte.
- **Tout est configurable par compte** : streams, sprints, colonnes du kanban, niveaux d'alerte, listes de valeurs, types de séance, comitologie, textes et libellés, sections affichées.
- **Trois sections par compte** : Program Management (V1), Finance management et Provisioning management (pages « À venir » en V1, activables ou non par compte).
- **Interface en français**, mobile d'abord, thème sombre aux couleurs Wifirst (thème clair disponible).
- **Traçabilité** : chaque création, modification, suppression ou déplacement est inscrit au journal, avec l'auteur et l'indication « via l'assistant » le cas échéant.
- **Assistant Claude intégré** : chaque utilisateur peut demander en langage naturel une synthèse ou une modification du contenu, dans la limite de ses droits.

## 2. Accès et sécurité

### 2.1 Connexion
1. E-mail et mot de passe.
2. Code à 6 chiffres envoyé par e-mail (Resend), valable 10 minutes, 5 essais maximum.
3. Session de 14 jours (cookie sécurisé, HttpOnly). Changer son mot de passe ou être désactivé ferme toutes les sessions.

Mot de passe : 10 caractères minimum, au moins une lettre et un chiffre. Les tentatives de connexion sont limitées (8 par tranche de 10 minutes et par adresse).

### 2.2 Rôles
| Rôle | Portée | Droits |
|---|---|---|
| Super-administrateur | Tous les comptes | Tout, plus la création de comptes clients, la gestion des utilisateurs, l'import et la sauvegarde complète |
| Administrateur | Un compte | Configuration du compte et gestion des accès, plus les droits d'éditeur |
| Éditeur | Un compte | Contenu : cartes, séances, faits marquants, statuts, sujets, risques, annuaire |
| Lecteur | Un compte | Consultation et commentaires |

Un utilisateur peut avoir des rôles différents selon les comptes. Les accès se donnent dans Paramètres du compte, rubrique Accès (création de l'utilisateur avec un mot de passe initial s'il n'existe pas).

## 3. Comptes clients

- **Création** (super-administrateur, page Administration) : nom du compte, client, sigle, picto, description, et configuration de départ :
  - par défaut (à partir de rien) : listes de valeurs standard et trois types de séance génériques ;
  - ou duplication de la configuration d'un compte existant (streams, sprints, listes, types de séance, comitologie, textes), sans les données.
- **Archivage** possible (super-administrateur).
- **Page d'accueil** : liste des comptes ouverts à l'utilisateur, avec son rôle et les sections actives.

## 4. Section Program Management

Reprise à l'identique, en fonctionnalités, de l'espace Notion « La Poste - PSTNG ».

### 4.1 Kanban (page d'accueil du compte)
De haut en bas :
1. **Bandeau d'introduction** (texte configurable).
2. **Derniers faits marquants** : ceux de la dernière séance du premier type de séance à faits marquants (Program weekly pour La Poste), en galerie : picto et titre, type, stream, détail.
3. **Cartes en vigilance ou en alerte** : toutes les cartes non terminées portant un niveau d'alerte, de la plus grave à la moins grave, avec niveau, stream, porteur, échéance (en rouge si dépassée) et alertes / arbitrages. Un clic ouvre la carte.
4. **Kanban** : colonnes = statuts (À faire, En cours, Standby, Terminé pour La Poste), couloirs = streams marqués « Kanban ». Filtres : sprint (en cours par défaut), porteur, recherche par titre ou référence, vigilance ou alerte uniquement. Glisser-déposer entre colonnes et couloirs (appui long sur mobile) ; sur mobile, une colonne à la fois. Couloirs repliables. Bouton « Nouvelle carte » et « + Ajouter » dans chaque case.
5. **Mode d'emploi** (texte configurable, replié).

### 4.2 Carte (livrable)
- En-tête : Réf. (numérotation automatique par compte), titre, statut, stream, porteur, sprint.
- Corps : description, point d'avancement, prochaines étapes, vigilance / alerte, alertes / arbitrages (encadré coloré selon le niveau), échéance.
- Détails : avancement (%), picto, date de mise à jour, archivage, suppression.
- Commentaires et historique des modifications (qui a changé quoi, avant et après).
- Règle de contenu (reprise du Notion) : alertes / arbitrages n'est renseigné que pour une carte en vigilance ou en alerte ; sinon les actions vont dans prochaines étapes.
- Balisage léger accepté dans les textes : **gras**, puces « • » ou « - », liens [texte](https://…).

### 4.3 Séances
Chaque **type de séance** (configurable) assemble un ou plusieurs blocs :
- **Faits marquants** : titre, picto, stream, type, détail ; ordre réglable.
- **Statut des streams** : une ligne par stream avec un ou plusieurs statuts, avancement, alertes et prérequis ; libellés des colonnes propres au type (« Statut COPROJ LP », « Alertes & prérequis LP »…).
- **Sujets** : picto, sujet, thématique, nature, description, arbitrage ou décision demandée (les décisions s'y saisissent sur une ligne « Décision : … »), ordre de passage.

Pour La Poste : Program weekly (faits marquants), COPROJ LP (statut des streams), Strategic Committee (sujets).

La page d'un type de séance liste les séances de la plus récente à la plus ancienne (la plus récente dépliée), avec :
- **Nouvelle séance** : séance vide à la date choisie ; pour un bloc statut des streams, les streams marqués « Ligne de séance » sont créés d'office.
- **À partir de la précédente** : recopie de la séance antérieure la plus proche :
  - faits marquants recopiés à la nouvelle date ;
  - statuts, avancement et alertes recopiés pour chaque stream ;
  - sujets recopiés sans les lignes « Décision : … » (ni ce qui les suit).
- Modification de la date, suppression d'une séance, édition en place des cellules, commentaires et historique sur chaque élément.
- Export Excel de toutes les séances du type.

### 4.4 Risques & arbitrages
Liste filtrable (type, stream, éléments clos masqués par défaut), triée par criticité puis échéance. Fiche : sujet, type, criticité, statut, stream, porteur, échéance, instance, description, décision / mitigation, cartes liées, commentaires, historique.

### 4.5 Gouvernance
- **Comitologie** : introduction, tableau interne (en-tête bleu pétrole) et tableau conjoint avec le client (en-tête ocre) : instance, finalité, participants, fréquence, support ou piloté par. Édition en place, ajout, ordre, suppression (administrateurs).
- **Streams et interlocuteurs** : streams marqués « Annuaire », leader et prescripteur client.
- **Sprints** : méthodologie, tableau des sprints (dates, état, échéance client, objectif) et bouton **Basculer au sprint suivant** : le sprint en cours passe à Terminé, le suivant à En cours, et les cartes non terminées sont reportées.

### 4.6 Journal
Toutes les modifications du compte, filtrables par type d'élément.

### 4.7 Exports
- **PowerPoint** au gabarit Wifirst (16:9, titres Hind Madurai gras bleu pétrole, corps Inter, palette du deck Program weekly) : couverture ; faits marquants de la séance choisie ; cartes en vigilance ou en alerte ; livrables du sprint, une slide par stream (pastille d'alerte, statut, porteur, échéance, point d'avancement ou alerte) ; statut des streams ; sujets du comité. Les tableaux longs se répartissent sur plusieurs slides sans couper une ligne. Choix du sprint, des sections et de la séance de chaque type.
- **Excel** : cartes (d'un sprint ou de tous), séances d'un type (un onglet par bloc).
- **Sauvegarde JSON** complète du compte (super-administrateur), réimportable.

## 5. Sections Finance management et Provisioning management
Pages « À venir » en V1. Chaque section s'active ou se masque par compte (Paramètres du compte, Général).

## 6. Paramètres d'un compte (administrateurs)
- **Général** : nom, client, sigle, picto, description ; sections actives ; libellés « leader » et « prescripteur » ; textes (introduction, mode d'emploi du kanban, introduction et titres de la comitologie, libellés de la dernière colonne, méthodologie des sprints).
- **Streams** : picto, nom, leader, prescripteur, ordre, actif, Kanban (couloir), Ligne de séance (créée d'office), Annuaire.
- **Sprints** : nom, dates, état, échéance client, objectif, ordre.
- **Listes de valeurs** (picto, libellé, couleur, ordre) : colonnes du kanban (avec la colonne « Terminé »), niveaux de vigilance / alerte, types de faits marquants, statuts des streams, thématiques et natures des sujets, types, statuts (avec « Clos ») et criticités des risques. Une valeur encore utilisée par des cartes ne peut pas être supprimée.
- **Types de séance** : nom, picto, fréquence, blocs, libellés de colonnes, cadrage, mode d'emploi, visibilité.
- **Annuaire** : contacts du compte (porteurs, auteurs), reliés automatiquement à un utilisateur de même e-mail ; un contact n'a pas besoin d'accès.
- **Accès** : membres et rôles.
- **Données** : exports.

## 7. Assistant Claude
- Bouton « Assistant Claude » (barre latérale, ou barre basse sur mobile). Panneau de conversation avec réponses affichées au fil de l'eau et étapes visibles (lecture, création, modification…).
- L'assistant lit et modifie le contenu du compte ouvert avec les **mêmes contrôles** que l'interface : un lecteur ne peut que lire (et commenter), un éditeur modifie le contenu, un administrateur aussi la configuration.
- Il sait notamment : résumer, rechercher, créer ou mettre à jour des cartes, déplacer une carte, préparer une séance à partir de la précédente, ajouter des faits marquants, statuts ou sujets, gérer les risques, commenter, basculer de sprint.
- Chaque modification est tracée au journal avec la mention « via l'assistant ». Chaque échange est conservé (demande, réponse, actions, consommation).
- Modèle par défaut : Claude Sonnet 5.5 (variable ANTHROPIC_MODEL). Facturation à l'usage sur la clé API Anthropic du compte Overdrive Management.

## 8. Reprise des données Notion
- Script `tools/notion_to_wacman.py` : convertit l'export des bases Notion en fichier d'import WacMan.
- Import par l'administration (rubrique Import) ou en ligne de commande. Si le compte existe, son contenu est remplacé et les accès conservés.
- V1 (import de développement du 03/10/2026) : 10 streams, 4 sprints, 7 contacts, 29 cartes (la carte vide Réf. 37 est ignorée), 6 séances (2 Program weekly, 2 COPROJ LP, 2 Strategic Committee), 6 faits marquants, 13 statuts de streams (la ligne vide du 25/09 est ignorée), 11 sujets, 18 risques et arbitrages, 10 instances de comitologie.
- Un nouvel import sera fait juste avant la mise en service.

## 9. Hors périmètre V1
- Contenu des sections Finance et Provisioning.
- Connexion SSO Microsoft.
- Domaine personnalisé.
- Accès des utilisateurs La Poste.

---

## Journal des évolutions (par prompt)

| Date | Demande | Effet |
|---|---|---|
| 03/10/2026 | Vérifier les comptes Vercel et Railway de turbolife pour développer une app de suivi de projet Wifirst | Constat : offres Hobby, crédit Railway presque consommé, architecture Vercel + Railway réutilisable |
| 03/10/2026 | Développer WacMan sur Vercel Hobby + Railway (région Europe), multi-comptes, Program Management repris du Notion, Finance et Provisioning en attente, tout configurable par compte | Spécification V1 et questions de cadrage |
| 03/10/2026 | Réponses au cadrage : e-mail + mot de passe + code par e-mail, 4 rôles, types de séance génériques, création de compte vide ou par duplication, commentaires, import Notion pour le développement, export PowerPoint dès la V1, charte Wifirst en thème sombre, spécification tenue à jour | V1 développée (sections 2 à 8) |
| 03/10/2026 | Connecteur avec Claude pour prompter et modifier le contenu, pour tous les utilisateurs ; solution retenue : assistant intégré appelant l'API Claude | Section 7 ; API hébergée sur Railway (pas de limite de durée Vercel) |
| 03/10/2026 | Reprendre le service d'e-mails de turbolife (Resend) ; toujours utiliser des projets distincts de turbolife et Flogger Forge dans Vercel, Railway et Resend | Resend retenu ; projet Railway « wacman » et projet Vercel dédiés |
| 03/10/2026 | Mise en service et mise en ligne ; dépôt GitHub relié | Dépôt privé OverdriveManagement/wacman ; API déployée sur Railway (Amsterdam) depuis GitHub ; front déployé sur Vercel (Paris) depuis GitHub ; chaque push sur main redéploie les deux |
| 04/10/2026 | Un prompt sur l'assistant IA fait planter le site | Flux de l'assistant fiabilisé (fin de connexion détectée sur la réponse, maintien de connexion toutes les 15 s, lecture tolérante des événements) ; zones d'erreur isolées (assistant, pages d'un compte, application) avec bouton Réessayer ; contrôle des références renforcé (identifiant valide et valeur de la bonne liste) |
