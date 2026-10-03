# WacMan : spécification fonctionnelle

WacMan (Wifirst Account Management) est l'application web de pilotage des comptes clients de Wifirst. Elle remplace l'espace Notion « La Poste - PSTNG » monté en septembre 2026 et le rend réutilisable pour d'autres clients.

Ce document décrit ce que fait l'application. Il est mis à jour à chaque évolution ; le journal en fin de document trace les demandes, prompt par prompt.

Version courante : **V1.1** (4 octobre 2026).

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

**Mot de passe oublié** (lien sur la page de connexion) : l'utilisateur saisit son e-mail et reçoit un code à 6 chiffres (valable 10 minutes, 5 essais), puis choisit un nouveau mot de passe ; toutes ses sessions ouvertes sont fermées. La réponse est identique que l'e-mail existe ou non, pour ne pas révéler les comptes. Demandes limitées (6 par adresse IP et 4 par e-mail par tranche de 10 minutes).

### 2.2 Jetons d'accès personnels
Menu utilisateur, « Connecteur Claude et jetons » : chaque utilisateur crée des jetons (nom, durée 30 jours, 90 jours, 1 an ou sans limite, option lecture seule) qui permettent à Claude ou à un script d'agir avec ses droits.
- Le jeton (préfixe `wac_`) n'est affiché qu'une fois ; seul son hachage est conservé. Liste des jetons actifs avec date de dernière utilisation, révocation immédiate.
- Un jeton en lecture seule donne les droits de lecteur, même à un administrateur.
- Un jeton ne permet ni de créer d'autres jetons, ni de changer de mot de passe, ni d'utiliser l'assistant intégré : ces actions demandent une session ouverte dans le navigateur.
- 20 jetons actifs au plus par utilisateur.

### 2.3 Rôles
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

### 4.0 Tableau de bord
Premier lien de la section. En un écran :
- quatre indicateurs : sprint en cours (jours restants et temps écoulé), livrables terminés du sprint, cartes en vigilance ou en alerte (par niveau), échéances dépassées (et nombre à échéance sous 15 jours) ;
- avancement du sprint : répartition des cartes par statut (barre segmentée) et, par stream, cartes terminées sur le total et nombre d'alertes ;
- listes cliquables : échéances dépassées, à échéance sous 15 jours, mes cartes en cours (cartes dont je suis porteur, si mon utilisateur est rattaché à ma fiche de l'annuaire) ;
- risques ouverts par criticité et risques dont l'échéance de traitement est dépassée ;
- séances : pour chaque type, dernière séance (lien direct) et prochaine séance déjà préparée ;
- activité récente (12 dernières modifications).
Les données se rafraîchissent chaque minute.

### 4.1 Kanban (page d'accueil du compte)
De haut en bas :
1. **Bandeau d'introduction** (texte configurable).
2. **Derniers faits marquants** : ceux de la dernière séance du premier type de séance à faits marquants (Program weekly pour La Poste), en galerie : picto et titre, type, stream, détail.
3. **Cartes en vigilance ou en alerte** : toutes les cartes non terminées portant un niveau d'alerte, de la plus grave à la moins grave, avec niveau, stream, porteur, échéance (en rouge si dépassée) et alertes / arbitrages. Un clic ouvre la carte.
4. **Kanban** : colonnes = statuts (À faire, En cours, Standby, Terminé pour La Poste), couloirs = streams marqués « Kanban ». Filtres : sprint (en cours par défaut), porteur, recherche par titre ou référence, et boutons « Vigilance ou alerte », « En retard » et « Mes cartes ». Sous le titre, barre d'avancement du sprint (cartes terminées sur le total). Glisser-déposer entre colonnes et couloirs (appui long sur mobile) ; sur mobile, une colonne à la fois. Couloirs repliables. Bouton « Nouvelle carte » et « + Ajouter » dans chaque case.
5. **Mode d'emploi** (texte configurable, replié).

### 4.2 Carte (livrable)
- En-tête : Réf. (numérotation automatique par compte), titre, statut, stream, porteur, sprint.
- Corps : description, point d'avancement, prochaines étapes, vigilance / alerte, alertes / arbitrages (encadré coloré selon le niveau), échéance.
- Détails : avancement (%), picto, date de mise à jour, duplication (copie de tous les champs sauf commentaires, placée juste après l'originale), archivage, suppression.
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
- Sur la séance dépliée : **Copier le CR** (compte rendu en texte, prêt à coller dans un e-mail : faits marquants, statuts des streams, sujets et arbitrages) et **PDF** (vue d'impression au gabarit Wifirst, à imprimer ou enregistrer en PDF depuis le navigateur).

### 4.4 Risques & arbitrages
Liste filtrable (type, stream, éléments clos masqués par défaut), triée par criticité puis échéance. Fiche : sujet, type, criticité, statut, stream, porteur, échéance, instance, description, décision / mitigation, cartes liées, commentaires, historique.

### 4.5 Gouvernance
- **Comitologie** : introduction, tableau interne (en-tête bleu pétrole) et tableau conjoint avec le client (en-tête ocre) : instance, finalité, participants, fréquence, support ou piloté par. Édition en place, ajout, ordre, suppression (administrateurs).
- **Streams et interlocuteurs** : streams marqués « Annuaire », leader et prescripteur client.
- **Sprints** : méthodologie, tableau des sprints (dates, état, échéance client, objectif) et bouton **Basculer au sprint suivant** : le sprint en cours passe à Terminé, le suivant à En cours, et les cartes non terminées sont reportées.

### 4.6 Journal
Toutes les modifications du compte, filtrables par type d'élément.

### 4.7 Recherche globale
Bouton « Rechercher » de l'en-tête, raccourci Ctrl+K (⌘K sur Mac) ou touche « / ». Recherche insensible à la casse et aux accents dans les cartes (titre et textes, ou numéro de référence : « 12 » ou « #12 »), risques, sujets et faits marquants des séances, streams et annuaire. Navigation au clavier ; un résultat ouvre directement la carte, le risque, la séance concernée ou la page Gouvernance.

### 4.8 Exports
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
- Outils supplémentaires en V1.1 : recherche insensible aux accents et lecture des indicateurs du tableau de bord.
- Fiabilité : une erreur d'affichage dans le panneau n'emporte plus la page (zone isolée, bouton Réessayer) ; la connexion est maintenue pendant les traitements longs.

### 7.1 Connecteur Claude (serveur MCP)
WacMan expose ses données à Claude hors de l'application (claude.ai, Claude Desktop, Claude Code) par un serveur MCP (Model Context Protocol), avec les mêmes outils que l'assistant intégré, plus `list_accounts`. Chaque outil prend en paramètre le compte client concerné.
- Branchement : créer un jeton d'accès (2.2), puis ajouter un connecteur personnalisé dans Claude avec l'adresse fournie, ou la commande `claude mcp add` pour Claude Code. Les instructions s'affichent à la création du jeton.
- Droits : ceux du porteur du jeton sur chaque compte ; un jeton en lecture seule ne voit pas les outils de modification.
- Traçabilité : chaque modification est inscrite au journal, marquée « via Claude ».
- Le même jeton donne accès à l'API REST de WacMan (en-tête `Authorization: Bearer`), pour des scripts ou intégrations.

## 8. Reprise des données Notion
- Script `tools/notion_to_wacman.py` : convertit l'export des bases Notion en fichier d'import WacMan.
- Import par l'administration (rubrique Import) ou en ligne de commande. Si le compte existe, son contenu est remplacé et les accès conservés.
- V1 (import de développement du 03/10/2026) : 10 streams, 4 sprints, 7 contacts, 29 cartes (la carte vide Réf. 37 est ignorée), 6 séances (2 Program weekly, 2 COPROJ LP, 2 Strategic Committee), 6 faits marquants, 13 statuts de streams (la ligne vide du 25/09 est ignorée), 11 sujets, 18 risques et arbitrages, 10 instances de comitologie.
- Un nouvel import sera fait juste avant la mise en service.

## 9. Robustesse
- Une erreur d'affichage dans une page d'un compte est contenue : la navigation reste disponible, avec les boutons Réessayer et Recharger.
- Les références saisies (statut, niveau d'alerte, type, criticité…) sont contrôlées : identifiant valide, appartenant au compte et pris dans la bonne liste de valeurs.
- Application installable sur mobile et ordinateur (icône WacMan, ouverture plein écran).

## 10. Hors périmètre
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
| 04/10/2026 | Trouver et intégrer de manière autonome d'autres améliorations, sans validation intermédiaire | V1.1 : tableau de bord (4.0), recherche globale Ctrl+K (4.7), filtres « En retard » et « Mes cartes » et barre d'avancement sur le kanban, duplication de carte, compte rendu de séance à copier ou en PDF, mot de passe oublié par code e-mail (2.1), jetons d'accès personnels (2.2), connecteur Claude MCP et API REST par jeton (7.1), application installable, correctifs (fenêtres décalées sous l'en-tête, lien direct qui rouvrait la carte d'origine après duplication) |
