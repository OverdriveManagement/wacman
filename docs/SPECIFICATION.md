# WacMan : spécification fonctionnelle

WacMan (Wifirst Account Management) est l'application web de pilotage des comptes clients de Wifirst. Elle remplace l'espace Notion « La Poste - PSTNG » monté en septembre 2026 et le rend réutilisable pour d'autres clients.

Ce document décrit ce que fait l'application. Il est mis à jour à chaque évolution ; le journal en fin de document trace les demandes, prompt par prompt.

Version courante : **V1.5** (4 octobre 2026).

---

## 1. Principes

- **Multi-comptes** : chaque client est un compte (La Poste est le premier). Toute donnée appartient à un compte.
- **Tout est configurable par compte** : streams, sprints, colonnes du kanban, niveaux d'alerte, listes de valeurs, types de séance, comitologie, textes et libellés, sections affichées.
- **Paramétrage en place** : les réglages courants se font depuis les écrans, sans passer par les paramètres du compte (« + » pour créer, « ⋯ » sur un en-tête pour modifier, « Nouveau… » dans une liste), réservés aux administrateurs pour la configuration et aux éditeurs pour l'annuaire. Les Paramètres du compte restent la vue complète.
- **Mode édition** (administrateurs) : bouton « Mode édition » de l'en-tête. Les boutons de structure (sprints, colonnes, streams, types de séance, valeurs de listes, comitologie, paliers de fraîcheur) n'apparaissent qu'en mode édition, signalé par un bandeau. Hors mode édition, le contenu reste modifiable : textes en édition directe, étiquettes, déplacement des cartes.
- **Écrans épurés** : pas de liste déroulante visible. Une valeur s'affiche comme une étiquette, un clic dessus ouvre le choix ; une valeur vide est une simple pastille discrète pour en ajouter une. Les ajouts sont un « + » ou « Ajouter » discret, visible au survol dans les cases du kanban.
- **Menu de gauche rétractable** : réduit aux pictos pour élargir l'écran (choix mémorisé sur l'appareil).
- **Mise en forme des textes** : barre d'outils dans chaque zone de texte multi-ligne (voir 4.8).
- **Trois sections par compte** : Program Management (V1), Finance management et Provisioning management (pages « À venir » en V1, activables ou non par compte).
- **Interface en français**, mobile d'abord, thème sombre aux couleurs Wifirst (thème clair disponible).
- **Traçabilité** : chaque création, modification, suppression ou déplacement est inscrit au journal, avec l'auteur et l'indication « via l'assistant » le cas échéant.
- **Assistant Claude intégré** : chaque utilisateur peut demander en langage naturel une synthèse ou une modification du contenu, dans la limite de ses droits.

## 2. Accès et sécurité

### 2.1 Connexion
1. E-mail et mot de passe.
2. Code à 6 chiffres envoyé par e-mail (Resend), valable 10 minutes, 5 essais maximum (comptés avant vérification, y compris pour des essais simultanés).
3. Session de 14 jours (cookie sécurisé, HttpOnly). Changer son mot de passe ou être désactivé ferme toutes les sessions.

Mot de passe : 10 caractères minimum, au moins une lettre et un chiffre. Les tentatives de connexion sont limitées (8 par tranche de 10 minutes et par adresse IP et e-mail, et 20 par tranche de 30 minutes pour un même e-mail quelle que soit l'adresse IP). Après connexion, seul un retour vers une page de WacMan est accepté.

**Mot de passe oublié** (lien sur la page de connexion) : l'utilisateur saisit son e-mail et reçoit un code à 6 chiffres (valable 10 minutes, 5 essais), puis choisit un nouveau mot de passe ; toutes ses sessions ouvertes sont fermées. La réponse est identique que l'e-mail existe ou non, pour ne pas révéler les comptes. Une demande de réinitialisation n'annule pas une connexion en cours. Demandes limitées (6 par adresse IP et 4 par e-mail par tranche de 10 minutes).

### 2.2 Jetons d'accès personnels
Menu utilisateur, « Connecteur Claude et jetons » : chaque utilisateur crée des jetons (nom, durée 30 jours, 90 jours, 1 an ou sans limite, option lecture seule) qui permettent à Claude ou à un script d'agir avec ses droits.
- Le jeton (préfixe `wac_`) n'est affiché qu'une fois ; seul son hachage est conservé. Liste des jetons actifs avec date de dernière utilisation, révocation immédiate.
- Un jeton en lecture seule donne les droits de lecteur, même à un administrateur (un super-administrateur lit tous les comptes), et ne peut rien modifier, pas même un commentaire.
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
Premier lien de la section ; le bandeau d'introduction du compte y figure en tête. En un écran :
- quatre indicateurs : sprint en cours (jours restants et temps écoulé), livrables terminés du sprint, cartes en vigilance ou en alerte (par niveau), échéances dépassées (et nombre à échéance sous 15 jours) ;
- avancement du sprint : répartition des cartes par statut (barre segmentée) et, par stream, cartes terminées sur le total et nombre d'alertes ;
- listes cliquables : échéances dépassées, à échéance sous 15 jours, mes cartes en cours (cartes dont je suis porteur, si mon utilisateur est rattaché à ma fiche de l'annuaire) ;
- risques ouverts par criticité et risques dont l'échéance de traitement est dépassée ;
- séances : pour chaque type, dernière séance (lien direct) et prochaine séance déjà préparée ;
- activité récente (12 dernières modifications).
Les données se rafraîchissent chaque minute.

### 4.1 Kanban (page d'accueil du compte)
Le kanban seul, sans bandeau ni faits marquants (ils sont dans le Program weekly), avec deux vues :
- **Par statut** : colonnes = statuts (À faire, En cours, Standby, Terminé pour La Poste), couloirs = streams marqués « Kanban ». Onglets de sprint en tête : sprint en cours (par défaut) et sprints suivants, « Sans sprint », « Tous », sprints terminés dans une liste. Ligne d'information du sprint : dates, échéance client, barre d'avancement (cartes terminées sur le total).
- **Par sprint** : colonnes = sprint en cours, sprints suivants et « Non planifiées », couloirs = streams ; chaque carte affiche son statut. Glisser une carte vers une autre colonne la replanifie dans ce sprint. Les cartes terminées sont masquées par défaut.
- **Étiquette de fraîcheur** sur chaque carte : nombre de jours depuis la dernière modification du contenu (« auj. » le jour même), avec un picto et une couleur par palier. Par défaut : 🟢 vert jusqu'à 7 jours, 🟠 orange de 8 à 14 jours, 🔴 rouge au-delà ; pas d'étiquette sur les cartes terminées. Le survol donne la date exacte. Paliers (nombre, seuils, pictos, couleurs, libellés), affichage et cartes terminées réglables par un administrateur : bouton « 🕒 Fraîcheur » du kanban en mode édition, ou Paramètres du compte. Le compteur repart à zéro à chaque modification d'un texte ou d'une propriété (statut, stream, porteur, sprint, dates, avancement, niveau d'alerte), y compris par glisser vers une autre colonne ; un réordonnancement dans la même case, un archivage ou la bascule automatique de sprint ne comptent pas.
- Bouton **Filtres** (replié par défaut) : porteur, titre ou référence, « Vigilance ou alerte », « En retard », « Sans mise à jour depuis plus de 7 j » (premier palier de fraîcheur, cartes non terminées), « Mes cartes », « Afficher les terminées » (vue par sprint).
- Glisser-déposer entre colonnes et couloirs (appui long sur mobile) ; sur mobile, une colonne à la fois. Couloirs repliables. Bouton « Nouvelle carte » et « + Ajouter » discret dans chaque case (au survol).
- Menu « ⋯ » du sprint choisi : **Bilan du sprint** (4.12), pour tous ; modifier et basculer pour les administrateurs.
- **Paramétrage en place** (administrateurs, en mode édition) : « + Sprint » à côté des onglets (le nouveau sprint s'enchaîne au dernier, même durée) et « ⋯ » du sprint choisi (modifier, basculer au sprint suivant) ; « ⋯ » d'une colonne (modifier libellé, picto, couleur, colonne « terminé », déplacer à gauche ou à droite, supprimer) et « + » en bout d'en-tête pour ajouter une colonne (ou un sprint en vue par sprint) ; « ⋯ » d'un couloir (modifier le stream, monter, descendre, retirer du kanban) et « + Ajouter un stream ».
- **Mode d'emploi** (texte configurable, replié).

### 4.2 Carte (livrable)
- En-tête : Réf. (numérotation automatique par compte), titre, statut, stream, porteur, sprint.
- Corps : description, point d'avancement, prochaines étapes, vigilance / alerte, début prévu, échéance (le début ne peut pas suivre l'échéance), alertes / arbitrages (encadré coloré selon le niveau). Début prévu et échéance alimentent le planning ; à défaut, le planning reprend les dates du sprint.
- Porteur et stream : « Nouveau contact… » ou « Nouveau stream… » dans la liste pour les créer sans quitter la carte.
- Propriétés affichées comme des étiquettes (clic pour modifier, pastille pour une valeur vide).
- Détails : avancement (%), picto, date de dernière modification du contenu avec l'étiquette de fraîcheur, duplication (copie de tous les champs sauf commentaires, placée juste après l'originale), archivage, suppression.
- Commentaires et historique des modifications (qui a changé quoi, avant et après).
- Règle de contenu (reprise du Notion) : alertes / arbitrages n'est renseigné que pour une carte en vigilance ou en alerte ; sinon les actions vont dans prochaines étapes.
- Balisage léger accepté dans les textes : **gras**, puces « • » ou « - », liens [texte](https://…).

### 4.3 Séances
Chaque **type de séance** (configurable) assemble un ou plusieurs blocs :
- **Faits marquants** : titre, picto, stream, type, détail ; ordre réglable.
- **Statut des streams** : une ligne par stream avec un ou plusieurs statuts, avancement, alertes et prérequis ; libellés des colonnes propres au type (« Statut COPROJ LP », « Alertes & prérequis LP »…).
- **Sujets** : picto, sujet, thématique, nature, description, arbitrage ou décision demandée, ordre de passage. Le bouton ⚖️ d'un sujet consigne une décision prise dans le registre (titre du sujet, date de la séance, lien vers le sujet).
- **Décisions** : décisions prises en séance et décisions attendues, tirées du registre commun du compte (4.10). Une décision attendue reste affichée de séance en séance jusqu'à ce qu'elle soit prise.
- **Relevé des actions** : actions de la série de séances, tirées du relevé commun du compte (4.10). Une action ouverte est reprise d'une séance à l'autre jusqu'à sa clôture ; une action close reste affichée à la séance qui suit sa clôture, barrée.

Pour La Poste : Program weekly (faits marquants, décisions), COPROJ LP (statut des streams, relevé des actions), Strategic Committee (sujets, décisions, relevé des actions). Ces blocs ont été ajoutés d'office aux types existants : relevé des actions avec le statut des streams, décisions et relevé des actions avec les sujets, décisions avec les faits marquants.

Deux blocs supplémentaires, **vues à date du kanban** (non enregistrées dans la séance, toujours à jour) : **cartes en vigilance ou en alerte** et **planning des cartes par stream**. Le Program weekly les reçoit par défaut (comptes existants compris) ; tout type de séance peut les activer.

La page d'un type de séance montre **une séance à la fois**, la plus récente par défaut :
- sélecteur de séance avec flèches précédente et suivante, pastille « à venir » pour une séance future ;
- **Nouvelle séance à partir de la précédente** (bouton principal) : recopie de la séance antérieure la plus proche (faits marquants recopiés à la nouvelle date ; statuts, avancement et alertes recopiés pour chaque stream ; sujets recopiés sans les lignes « Décision : … » ni ce qui les suit) ;
- **Séance vide** : séance à la date choisie ; pour un bloc statut des streams, les streams marqués « Ligne de séance » sont créés d'office ;
- sur la séance : Copier le CR, PDF, date modifiable, « ⋯ » (changer la date, supprimer) ; Excel de toutes les séances du type ;
- **Copier le CR** copie un e-mail mis en forme, à coller dans Gmail ou Outlook, sur le modèle du CR COPROJ du 01/10/2026 : « Bonjour, », phrase d'introduction, sections numérotées en titres bleus soulignés, tableaux à en-tête bleu et lignes alternées, formule de fin et prénom de l'utilisateur. Selon les blocs du type : faits marquants (type, stream, fait), cartes en vigilance ou en alerte (niveau, stream, livrable avec alertes et échéance, porteur), statut des streams en deux sections (« Vue d'ensemble » : streams regroupés par statut sur fond de couleur ; « Synthèse par stream » : stream et statut, avancement, alertes précédées du libellé du type), sujets (numéro, thématique et nature, sujet avec arbitrage demandé), décisions (tableau des décisions prises, puis des décisions attendues), relevé des actions (numéro, porteur Wifirst, client ou Commun avec le nom de la personne, stream, action, échéance si renseignée ; « (fait) » ou « (abandonnée) » pour une action close), notes. Avec le bloc Décisions, les lignes « Décision : … » d'un sujet ne sont plus répétées dans l'arbitrage demandé. Le balisage des textes devient gras, italique, listes, liens. Une version texte simple accompagne la copie pour les messageries sans mise en forme ;
- **E-mail** (menu ✉️ à côté de Copier le CR) : copie le compte rendu puis ouvre un nouveau message Gmail avec l'objet, les destinataires et le compte d'envoi du type de séance (il reste à coller le compte rendu), ou un nouveau message dans la messagerie de l'ordinateur ; « Copier l'objet ». Objet, destinataires (À, Cc), compte Gmail d'envoi, introduction et formule de fin se règlent dans le type de séance (rubrique « E-mail du compte rendu »), avec les variables {type}, {date}, {date_longue}, {compte} et {client}. Pour le COPROJ LP : objet « WIFIRST / PSTNG : CR COPROJ du JJ/MM/AAAA », destinataires et introduction repris de l'envoi du 03/10/2026 ;
- **Quoi de neuf depuis le JJ/MM** (panneau repliable en tête de séance) : ce qui a changé depuis la séance précédente du même type (à défaut, sur 7 jours), d'après le journal : livrables terminés, nouveaux livrables, passés en vigilance ou en alerte, sortis d'alerte, changements de statut, échéances modifiées, météo des streams (statut changé d'une séance à l'autre), actions closes et nouvelles, décisions, bascule de sprint. Un clic sur un livrable ouvre la carte ;
- **✨ Proposer** (bloc faits marquants, éditeurs) : Claude rédige 3 à 6 faits marquants à partir de « Quoi de neuf » et des cartes en alerte ; on décoche, corrige (titre, détail, type, stream) puis on ajoute à la séance. Rien n'est enregistré sans validation ;
- **📝 Importer un CR** (bloc relevé des actions, éditeurs) : import d'un compte rendu d'atelier rattaché à la série et à la séance affichées (4.13) ;
- **Exporter la séance affichée (PowerPoint)** (menu du type de séance) : ouvre l'export avec la séance et le modèle du type présélectionnés (COPROJ ou Program weekly) ;
- le PDF (vue d'impression) contient aussi les décisions et le relevé des actions ;
- « ⋯ » du type de séance (administrateurs) : modifier ce type (nom, picto, fréquence, blocs, libellés, cadrage, mode d'emploi), créer un nouveau type. Un « + » à côté de « Program Management » dans le menu crée aussi un type de séance.

**Program weekly**, de haut en bas :
1. **Faits marquants** de la séance, modifiables directement sur l'écran : titre et détail au clic (avec barre de mise en forme), type et stream par listes courtes, ordre par flèches ; ajout rapide (titre puis Entrée) et formulaire complet (picto, commentaires, historique).
2. **Cartes en vigilance ou en alerte** à date, de la plus grave à la moins grave ; un clic ouvre la carte dans la page.
3. **Planning des livrables par stream** (Gantt) :
   - une ligne par carte, regroupée par stream (couloirs repliables avec nombre de cartes, d'alertes et de retards) ; seule la colonne de gauche porte le titre de la carte, un clic ouvre la carte ;
   - une barre du début prévu à l'échéance ; couleur selon le niveau (vigilance, alerte), bleu sans alerte, vert pâle si terminée ; trait pointillé quand une date manque et que celle du sprint la remplace ; losange pour une échéance seule ; marque rouge en bout de barre si l'échéance est dépassée ;
   - repères : mois, semaines, bandes des sprints (avec l'échéance client en info-bulle), ligne « Aujourd'hui » ; info-bulle complète (dates, statut, niveau, porteur) ;
   - filtres : stream, sprint en cours et à venir ou tous, vigilance ou alerte, terminées ; zoom Semaines ou Mois ; bouton Aujourd'hui ;
   - éditeurs : glisser une barre pour la décaler, ses bords pour changer le début ou l'échéance (au jour près, avec aperçu des dates) ; un simple clic ouvre la carte.

Statut des streams : « + » parmi les statuts (administrateurs) pour créer un nouveau statut de stream.

### 4.4 Risques & arbitrages
Liste filtrable (type, stream, éléments clos masqués par défaut), triée par criticité puis échéance. Fiche : sujet, type, criticité, statut, stream, porteur, échéance, instance, description, décision / mitigation, cartes liées, commentaires, historique. Type, criticité, statut, stream et porteur se créent depuis la fiche (« Nouveau… » dans la liste).

### 4.5 Gouvernance
- **Comitologie** : introduction, tableau interne (en-tête bleu pétrole) et tableau conjoint avec le client (en-tête ocre) : instance, finalité, participants, fréquence, support ou piloté par. Édition en place, ajout, ordre, suppression (administrateurs).
- **Streams et interlocuteurs** : streams marqués « Annuaire », leader et prescripteur client ; crayon pour modifier un stream, « Ajouter un stream » (administrateurs).
- **Sprints** : méthodologie, tableau des sprints (dates, état, échéance client, objectif, lien « Bilan »), crayon pour modifier ou supprimer un sprint, **Nouveau sprint** et **Basculer au sprint suivant** : le sprint en cours passe à Terminé, le suivant à En cours, les cartes non terminées sont reportées, puis le bilan du sprint terminé s'affiche (4.12).

### 4.6 Journal
Toutes les modifications du compte, filtrables par type d'élément.

### 4.7 Recherche globale
Bouton « Rechercher » de l'en-tête, raccourci Ctrl+K (⌘K sur Mac) ou touche « / ». Recherche insensible à la casse et aux accents dans les cartes (titre et textes, ou numéro de référence : « 12 » ou « #12 »), risques, sujets et faits marquants des séances, streams et annuaire. Navigation au clavier ; un résultat ouvre directement la carte, le risque, la séance concernée ou la page Gouvernance.

### 4.8 Mise en forme des textes
Chaque zone de texte multi-ligne (cellule éditable au clic, fiche d'une carte, fait marquant, sujet, risque, commentaire, textes du compte et des types de séance) affiche une barre d'outils pendant la saisie, sur le modèle des éditeurs du marché :
- **Gras** (Ctrl+B), *italique* (Ctrl+I), souligné (Ctrl+U), barré (Ctrl+Maj+X), surligné, code ou référence ;
- liste à puces (Ctrl+Maj+8), liste numérotée (Ctrl+Maj+7), cases à cocher, intertitre ;
- lien (Ctrl+K : la sélection devient le texte du lien, l'adresse reste à compléter) ;
- effacer la mise en forme de la sélection ou de la ligne.
Un bouton appliqué deux fois retire la mise en forme. Entrée prolonge une liste (puce, numéro, case) et une ligne de liste vide la termine. En lecture, les cases à cocher se cochent d'un clic. Le texte reste stocké en balisage léger (lisible tel quel) et repris dans le compte rendu copié, le PDF, Excel et PowerPoint. Ctrl+Entrée ou un clic à l'extérieur enregistre, Échap annule.

### 4.9 Exports
- **PowerPoint** au gabarit Wifirst (16:9, titres Hind Madurai gras bleu pétrole, chapô Inter 8 pt, intertitres Inter ExtraBold bleus avec filet, cartes sur fond gris clair, mention de confidentialité), sur le modèle des decks Program weekly du 28/09 et COPROJ LP du 01/10/2026. **Modèles** : Program weekly (couverture, livrables du sprint, faits marquants, actions en cours des streams, focus stream, ce que nous attendons du client, cartes en vigilance ou en alerte, relevé des actions, planning), COPROJ (couverture, avancement des streams en cartes, sujets, registre des décisions, relevé des actions, attentes du client), Bilan de sprint, ou Personnalisé. Slides disponibles :
  - **Les livrables du sprint** : deux streams par slide, une carte par livrable (titre, description ou alerte, échéance, statut, porteur, pastille Vigilance ou Alerte, liseré de couleur) ;
  - livrables du sprint au format compact, une slide par stream ;
  - **Faits marquants de la semaine** des séances retenues ;
  - **Actions en cours des streams** : une tuile par stream avec sa météo (Au planning, Non commencé, Vigilance, Risque, Alerte, déduite des alertes des cartes et des risques ouverts), les livrables en cours et leur échéance ;
  - **Focus stream** : une slide par stream choisi (tous les streams du sprint si aucun) : météo, alertes, avancement, risques et blocages, prochaines étapes, décisions attendues ;
  - **Ce que nous attendons de <client>** : actions ouvertes portées par le client et décisions attendues, par stream et par échéance ;
  - **Avancement des streams Wifirst, alertes et prérequis** (COPROJ) : légende des statuts, une carte par stream (statut en capitales, avancement, alertes et prérequis), la ligne Gouvernance en bandeau de pied de slide ;
  - statut des streams en tableau ; sujets du comité (sans les lignes de décision quand le registre est actif) ;
  - cartes en vigilance ou en alerte ; **registre des décisions** et **relevé des actions** de chaque séance retenue (à défaut : décisions attendues et prises sur 30 jours, actions ouvertes) ;
  - **bilan du sprint** ; **planning des livrables** (Gantt par stream, mêmes couleurs que l'écran, ligne Aujourd'hui).
  La mise en forme des textes (gras, italique, souligné, barré, surligné, puces, cases) est reprise. Les tableaux longs se répartissent sur plusieurs slides sans couper une ligne. Choix du sprint, du modèle, des sections, des streams du focus et de la séance de chaque type. Le nom du fichier reprend le modèle.
- **Excel** : cartes (d'un sprint ou de tous, avec début prévu et échéance), séances d'un type (un onglet par bloc).
- **Sauvegarde JSON** complète du compte (super-administrateur), réimportable.

### 4.10 Actions & décisions
Page du menu Program Management, qui rassemble pour tout le compte :
- le **relevé des actions** : intitulé, porteur (Wifirst, client ou Commun), personne (contact de l'annuaire), stream, série de séances, échéance (en rouge si dépassée), état (ouverte, faite, abandonnée, avec la date de clôture). Case à cocher pour marquer une action faite, menu pour l'abandonner, la rouvrir ou la supprimer ; ajout rapide (intitulé puis Entrée) ;
- le **registre des décisions** : statut (attendue ou prise), intitulé, précisions, stream, instance, date de la décision ou date attendue ; lien éventuel vers le sujet de séance d'origine.
Filtres : recherche, statut, porteur, stream, série de séances. Bouton « Importer un CR d'atelier » (4.13). Les mêmes listes s'éditent dans les séances (4.3), la revue de stream (4.11) et par l'assistant.

### 4.11 Revue de stream
Support de l'heure hebdomadaire avec chaque stream leader (menu « Revue de stream ») :
- choix du stream (liste et flèches), leader et prescripteur ; chiffres : livrables, terminés, en vigilance ou alerte, actions ouvertes, cartes sans mise à jour depuis le dernier palier de fraîcheur ;
- dernier statut saisi en séance (statuts, avancement, alertes et prérequis, lien vers la séance) et statut précédent ;
- décisions attendues et décisions prises sur 30 jours ; livrables regroupés par statut avec alerte, échéance, porteur et étiquette de fraîcheur (option « Avancement et prochaines étapes ») ; actions du stream, modifiables ; risques ouverts ; faits marquants récents ; activité des 14 derniers jours (une ligne par carte et par type de modification) ;
- **Présenter** : plein écran sans menu, texte agrandi ; flèches gauche et droite pour passer d'un stream à l'autre, Échap pour quitter. L'adresse de la page suit le stream affiché.

### 4.12 Bilan de sprint
Page d'un sprint (lien « Bilan » de la Gouvernance, menu du sprint dans le kanban, affichage automatique après une bascule) :
- période, objectif et échéance client ; chiffres : livrables au périmètre, terminés (et pourcentage), reportés au sprint suivant (sprint terminé) ou restant à terminer (sprint en cours), en vigilance ou alerte, décisions prises et actions closes ;
- livrables terminés et reportés, par stream ; points de vigilance avec leurs alertes ; décisions prises pendant le sprint ; actions closes et ouvertes ; faits marquants de la période ; lien vers le sprint suivant ;
- **Copier l'e-mail** : bilan mis en forme comme le compte rendu de séance (synthèse, livrables terminés, reportés, points de vigilance, décisions, actions ouvertes, suite) ; nouveau message Gmail, copie de l'objet ; **diapositive PowerPoint** du bilan.
Pour un sprint terminé, la liste des cartes reportées est celle enregistrée au moment de la bascule.

### 4.13 Import d'un compte rendu d'atelier
Depuis la page Actions & décisions ou le relevé des actions d'une séance (éditeurs) :
1. coller le compte rendu ou la transcription, ou déposer un fichier Word (.docx), texte (.txt, .md) ou sous-titres de visio (.vtt, .srt) ; préciser l'atelier, la date, le stream principal et la série de séances à laquelle rattacher les actions ;
2. « Analyser avec Claude » : Claude propose des actions (porteur, personne, stream, échéance), des livrables (nouvelles cartes) et des décisions (prises ou attendues), chacune avec le passage du texte qui la justifie ; les noms de stream et de personne sont rapprochés de ceux du compte ;
3. chaque proposition se corrige puis se crée ou s'ignore **une par une** (ou « Créer les N restantes ») ; les cartes vont dans le sprint et le statut choisis. L'origine (« Atelier … du JJ/MM/AAAA ») est notée sur l'action ou la décision. Rien n'est créé sans validation.

## 5. Sections Finance management et Provisioning management
Pages « À venir » en V1. Chaque section s'active ou se masque par compte (Paramètres du compte, Général).

## 6. Paramètres d'un compte (administrateurs)
- **Général** : nom, client, sigle, picto, description ; sections actives ; libellés « leader » et « prescripteur » ; textes (introduction, mode d'emploi du kanban, introduction et titres de la comitologie, libellés de la dernière colonne, méthodologie des sprints) ; fraîcheur des cartes (affichage, cartes terminées, paliers ; enregistrement séparé, retour aux valeurs par défaut).
- **Streams** : picto, nom, leader, prescripteur, ordre, actif, Kanban (couloir), Ligne de séance (créée d'office), Annuaire.
- **Sprints** : nom, dates, état, échéance client, objectif, ordre.
- **Listes de valeurs** (picto, libellé, couleur, ordre) : colonnes du kanban (avec la colonne « Terminé »), niveaux de vigilance / alerte, types de faits marquants, statuts des streams, thématiques et natures des sujets, types, statuts (avec « Clos ») et criticités des risques. Une valeur encore utilisée par des cartes ne peut pas être supprimée.
- **Types de séance** : nom, picto, fréquence, blocs, libellés de colonnes, cadrage, mode d'emploi, visibilité, e-mail du compte rendu (objet, compte Gmail d'envoi, À, Cc, introduction, formule de fin).
- **Annuaire** : contacts du compte (porteurs, auteurs), reliés automatiquement à un utilisateur de même e-mail ; un contact n'a pas besoin d'accès.
- **Accès** : membres et rôles.
- **Données** : exports. La sauvegarde complète du compte (super-administrateur) contient aussi les commentaires et l'état actif des types de séance ; la réimporter restitue le compte à l'identique.

## 7. Assistant Claude
- Bouton « Assistant Claude » (barre latérale, ou barre basse sur mobile). Panneau de conversation avec réponses affichées au fil de l'eau et étapes visibles (lecture, création, modification…).
- L'assistant lit et modifie le contenu du compte ouvert avec les **mêmes contrôles** que l'interface : un lecteur ne peut que lire (et commenter), un éditeur modifie le contenu, un administrateur aussi la configuration.
- Il sait notamment : résumer, rechercher, créer ou mettre à jour des cartes, déplacer une carte, préparer une séance à partir de la précédente, ajouter des faits marquants, statuts ou sujets, gérer les risques, commenter, basculer de sprint.
- Chaque modification est tracée au journal avec la mention « via l'assistant ». Chaque échange est conservé (demande, réponse, actions, consommation).
- Modèle par défaut : Claude Sonnet 5.5 (variable ANTHROPIC_MODEL). Facturation à l'usage sur la clé API Anthropic du compte Overdrive Management.
- Outils supplémentaires en V1.1 : recherche insensible aux accents et lecture des indicateurs du tableau de bord.
- Fiabilité : une erreur d'affichage dans le panneau n'emporte plus la page (zone isolée, bouton Réessayer) ; la connexion est maintenue pendant les traitements longs.
- V1.5 : l'assistant consigne les décisions dans le registre (prises ou attendues, avec la séance ou le sujet) et les actions dans le relevé (porteur, personne, stream, échéance, série de séances ; clôture en passant l'action à faite).
- Propositions ponctuelles de Claude, hors du panneau : extraction d'un compte rendu d'atelier (4.13) et brouillon de faits marquants (4.3). Elles passent par un outil à format imposé, sont réservées aux éditeurs connectés dans le navigateur (pas par jeton d'accès), limitées à 30 par heure et par utilisateur, et rien n'est enregistré sans validation.

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
- Relevé et registre (V1.5) : les 7 actions du COPROJ LP du 01/10/2026 (compte rendu envoyé le 03/10/2026) sont reprises dans le relevé, et les décisions déjà écrites dans les sujets (ligne « Décision : … ») dans le registre, datées de leur séance et reliées au sujet (4 décisions du Strategic Committee du 29/09). La sauvegarde complète du compte contient les actions et les décisions.
- Fraîcheur : la date « Mis à jour » de chaque livrable Notion devient la date de dernière modification du contenu de la carte (import et script). Pour le compte La Poste déjà en service, les dates relevées dans Notion le 04/10/2026 ont été appliquées par Réf. ; une modification faite dans WacMan depuis l'import l'emporte si elle est plus récente.

## 9. Robustesse
- Une erreur d'affichage dans une page d'un compte est contenue : la navigation reste disponible, avec les boutons Réessayer et Recharger.
- Une coupure passagère du réseau ou un redéploiement ne remplace pas l'écran : la page en cours, ses fenêtres et ses saisies restent en place.
- Saisie : un double clic ou une touche Entrée maintenue ne crée pas deux fois le même élément ; une date se saisit puis se valide (OK, Entrée ou clic à l'extérieur) au lieu d'être enregistrée à chaque chiffre ; un rafraîchissement venu du serveur n'écrase pas un texte en cours de frappe ; des clics rapides sur des cases à cocher ou des étiquettes multiples sont tous pris en compte.
- Fenêtres : Échap ferme seulement la fenêtre du dessus (une confirmation par-dessus une carte).
- Mobile : le glisser d'une carte du kanban se fait par appui long, le défilement de la page restant possible ; un glisser de barre du planning interrompu par le navigateur est abandonné sans rien enregistrer.
- Les données envoyées sont contrôlées côté serveur : dates réelles (pas de 30 février), début de sprint avant sa fin, une seule séance d'un type par date (y compris en changeant la date), un seul sprint en cours à la fois, statut de carte pris dans les colonnes du kanban, utilisateur relié à un contact ayant accès au compte ; une valeur mal formée renvoie un message clair et jamais une erreur interne.
- Supprimer un statut de stream le retire des séances qui le portaient. Une séance recopiée depuis la précédente ne reprend pas les streams désactivés et ajoute les streams du modèle créés entre-temps.
- Les erreurs techniques ne sont jamais renvoyées en détail à l'assistant ni au connecteur Claude. « Arrêter » l'assistant stoppe aussi les actions qu'il n'a pas encore lancées.
- Les références saisies (statut, niveau d'alerte, type, criticité…) sont contrôlées : identifiant valide, appartenant au compte et pris dans la bonne liste de valeurs. Une action ou une décision ne peut viser qu'un stream, un contact, une carte, un sujet, une séance ou une série du même compte ; la date de clôture d'une action est tenue par le serveur.
- Mise en forme : les mêmes règles s'appliquent à l'écran, au compte rendu copié, au PDF, à Excel et à PowerPoint (gras dans l'italique et inversement, adresses avec parenthèses ; « 2*x + 3*y » ou « nom__de__fichier » restent du texte). PowerPoint conserve désormais gras, italique, souligné, surligné et cases à cocher.
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
| 04/10/2026 | Distinguer Kanban et Program weekly : Kanban du sprint en cours et des sprints suivants par stream ; Program weekly avec faits marquants éditables, cartes en vigilance ou en alerte, planning Gantt par stream (barres colorées selon le niveau, titre cliquable), complété par mes idées ; déplacer le paramétrage dans les écrans sans les alourdir | V1.2 : kanban en deux vues, par statut (onglets de sprint) et par sprint (replanification par glisser) (4.1) ; page de séance à une séance à la fois, faits marquants en édition directe et ajout rapide, blocs à date « cartes en vigilance ou en alerte » et « planning » (4.3) ; date de début prévu des cartes ; planning glissable, jalons, retards, sprints, zoom ; slide Planning dans l'export PowerPoint ; paramétrage en place : sprints, colonnes, streams, types de séance, valeurs de listes et contacts créés depuis les écrans (1, 4.1, 4.3 à 4.5) |
| 04/10/2026 | Ajouter des options de mise en forme du texte (gras, italique, puces et boutons standard du marché) à l'édition d'une cellule et dans une carte ouverte | Barre de mise en forme et raccourcis clavier dans toutes les zones de texte multi-ligne, cases à cocher cliquables, rendu et exports mis à jour (4.8) |
| 04/10/2026 | Créer un mode édition : boutons d'édition des modèles visibles seulement dans ce mode ; cacher au maximum les boutons d'édition des cartes et éléments (textes toujours éditables, déplacement des cartes toujours possible) ; pas de liste déroulante ni d'étiquette vide visibles, un clic sur l'étiquette pour la modifier et une pastille discrète pour une valeur vide ; ajout de carte plus discret ; menu de gauche rétractable | V1.3 : mode édition des administrateurs avec bandeau (1) ; étiquettes cliquables et pastilles à la place des listes déroulantes (cartes, faits marquants, statuts des streams, sujets, gouvernance) ; « + Ajouter » discret au survol ; menu de gauche réduit aux pictos (1, 4.1, 4.2) |
| 04/10/2026 | Étiquette sur les cartes du kanban : nombre de jours depuis la dernière modification du contenu, couleur et picto selon l'ancienneté, paramétrable par l'administrateur (par défaut 7 jours, 14 jours, plus ancien) ; reprendre les dates de dernière modification des cartes La Poste depuis Notion | Étiquette de fraîcheur, filtre « Sans mise à jour », paliers réglables depuis le kanban et les paramètres (4.1, 4.2, 6) ; date de modification du contenu suivie à part du simple réordonnancement ; dates Notion appliquées au compte La Poste ; colonne « Contenu modifié le » dans l'export Excel (8) |
| 04/10/2026 | Améliorer « Copier le CR » pour retrouver la mise en forme du CR envoyé dans Gmail pour le COPROJ LP (la copie actuelle est sans mise en forme) | Copie en texte enrichi reprenant la présentation de l'e-mail du 03/10/2026 (titres numérotés, tableaux à en-tête bleu, statuts colorés), pour tous les types de séance, avec la version texte en secours (4.3) |
| 04/10/2026 | Faire un tour général de tout ce qui a été développé, tout re-tester et corriger les bugs dans la foulée | V1.4 : revue de code complète (API, écrans, exports) et environ 40 correctifs ; 8 suites de tests rejouées, dont 2 nouvelles (correctifs API, tour de tous les écrans en sombre, clair, mobile et lecteur). Sécurité : jeton en lecture seule sans aucune écriture, jeton court de l'assistant limité à l'assistant, essais de code comptés avant vérification, limite de connexion par e-mail, retour après connexion limité au site, aucun code de connexion dans les journaux en production. Données : sauvegarde complète avec commentaires, statuts supprimés retirés des séances, séance recopiée alignée sur les streams actifs, contrôles de dates et de références. Écrans : glisser tactile du kanban et du planning, date validée en une fois, double envoi impossible, clics rapides pris en compte, Échap sur la seule fenêtre du dessus, carte archivée retirée, carte créée depuis « Sans sprint » sans sprint, ouverture d'une carte au clavier, titres longs coupés, sélecteur de séance lisible sur mobile, compteur « à échéance sous 15 jours » exact. Mise en forme : règles uniques partagées par l'écran et les exports, PowerPoint mis en forme, barre d'outils corrigée (gras et italique combinés, listes sur ligne vide, Ctrl+K sans ouvrir la recherche), « Copier le CR » attend la fin d'une saisie en cours (2, 6, 9) |
| 04/10/2026 | Faire A (1 à 4), puis B (6, 7, 9), puis D (15) de la liste d'évolutions proposée ; garder le reste en mémoire pour plus tard | V1.5 : exports PowerPoint au format des decks Program weekly et COPROJ (livrables du sprint, météo des streams, focus stream, attentes du client, avancement des streams en cartes, registre des décisions, relevé des actions, bilan de sprint ; modèles d'export) (4.9) ; relevé des actions et registre des décisions communs au compte, blocs de séance et page Actions & décisions, actions ouvertes reprises de séance en séance (4.3, 4.10) ; e-mail complet du compte rendu (objet, destinataires, introduction, formule de fin par type, ouverture de Gmail) (4.3, 6) ; « Quoi de neuf depuis la dernière séance » et faits marquants proposés par Claude (4.3) ; revue de stream avec mode présentation (4.11) ; bilan de sprint, e-mail et diapositive, affiché après la bascule (4.12) ; import d'un compte rendu d'atelier avec validation une par une (4.13) ; reprise des actions du COPROJ du 01/10, des décisions des sujets et des réglages d'e-mail du COPROJ (8) |
