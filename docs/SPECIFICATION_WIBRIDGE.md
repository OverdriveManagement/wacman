# WiBridge : spécification fonctionnelle

WiBridge est l'espace d'échange entre Wifirst et ses clients. Wifirst et le client y posent leurs questions et leurs demandes d'éléments, chaque question est attribuée à l'organisation qui doit agir, et les échanges se poursuivent jusqu'à la clôture. Premier client : La Poste (programme PST-NG).

WiBridge est une interface autonome, publiée sur Vercel à l'adresse https://wibridge-wifirst.vercel.app. Elle s'appuie sur la même API et la même base que WacMan (Railway), avec des comptes et des sessions séparés.

Ce document décrit ce que fait l'application. Il est mis à jour à chaque évolution ; le journal en fin de document trace les demandes, prompt par prompt. L'architecture commune est décrite dans `ARCHITECTURE.md` (partie WiBridge) et l'hébergement dans `EXPLOITATION.md`.

Version courante : **V1.5** (9 octobre 2026).

---

## 1. Principes

- **Deux organisations par client** : Wifirst et le client (La Poste). Les deux libellés sont réglables par client et repris partout (« Attribuée à La Poste », « Éditeur Wifirst »).
- **Une question a toujours un attributaire** : l'organisation qui doit agir. Elle répond puis choisit la suite : attribuer à l'autre organisation, conserver l'attribution ou clôturer. Les allers-retours sont illimités ; une question clôturée peut être rouverte.
- **Tableau des questions** : une question par ligne, toutes les colonnes triables, édition directe dans la liste (sujet, texte, streams, échéance, attribution, statut) avec la barre de mise en forme de WacMan.
- **Streams** : chaque question relève d'un ou plusieurs streams. Les droits se donnent par client et par stream.
- **Traçabilité** : toute création, modification, réponse, attribution, clôture, réouverture et pièce jointe est inscrite à l'historique de la question, avec l'auteur, son organisation, la date et l'heure.
- **Tout est configurable par le super-administrateur** : clients, libellés, streams, règles, utilisateurs et droits.
- **Séparé de WacMan** : comptes distincts (sauf le super-administrateur), sessions distinctes, aucun lien de l'un vers l'autre.
- **Interface en français**, mobile d'abord, thème sombre aux couleurs Wifirst (thème clair disponible), application installable (icône WiBridge).

## 2. Lecture de la demande

Les points de la demande qui laissaient un choix ont été tranchés ainsi (chaque règle reste réglable par client, partie 5.3) :

| Demande | Règle appliquée |
|---|---|
| « Les nouveaux utilisateurs n'ont accès qu'à WiBridge par défaut » | Un compte créé dans WiBridge n'a pas accès à WacMan. Seul le super-administrateur l'ouvre. |
| « Les membres de Wifirst peuvent remplir les éléments attribués à Wifirst mais aussi au client » | Un éditeur Wifirst répond aux questions attribuées à Wifirst et à celles attribuées au client (il les complète à sa place). |
| « Le client ne peut que remplir ses éléments attribués à lui, ou poser de nouvelles questions pour les envoyer à Wifirst » | Un éditeur client répond seulement aux questions attribuées au client. Ses nouvelles questions sont attribuées à Wifirst. |
| « La Poste peut éditer les questions qui lui sont attribuées uniquement » | Sur les questions attribuées à La Poste : réponse et changement d'attribution. Le sujet et le texte d'une question restent modifiables par la personne qui l'a créée (« le sujet peut être édité par celui qui a créé la question »). |
| « La Poste peut clôturer des questions » | Un éditeur client clôture toute question qu'il voit (réglage possible : seulement celles qu'il a posées ou qui lui sont attribuées). |
| « N'importe qui peut rouvrir une question clôturée » | Tout éditeur, Wifirst ou client. Un lecteur ne modifie rien. |
| « Wifirst peut tout changer » | Un éditeur Wifirst modifie sujet, texte, streams, échéance, attribution et messages de toutes les questions qu'il voit. |
| Issues de réponse demandées | « Attribuer à Wifirst » (demande de réponse à Wifirst), « Conserver l'attribution (La Poste) », « Clôturer ». |

Ajouts au-delà de la demande, pour que l'échange fonctionne sans outil à côté : statut « En cours » (l'attributaire a donné de premiers éléments et garde la main), échéance souhaitée, pièces jointes (par exemple la liste des ATM en Excel), e-mails de notification et récapitulatif quotidien, recherche, filtres, export Excel, corbeille.

## 3. Comptes et séparation avec WacMan

- **Un compte, deux accès** : chaque compte porte un accès WacMan et un accès WiBridge, indépendants.
- **Compte créé dans WiBridge** : accès WiBridge seul. Il ne se connecte pas à WacMan (même refus qu'un mauvais mot de passe), n'apparaît pas dans l'administration de WacMan et ne reçoit pas de code de réinitialisation WacMan.
- **Ouvrir WacMan à un compte WiBridge** : réservé au super-administrateur, par la bascule « Accès à WacMan » de l'administration de WiBridge, ou en ajoutant la personne comme membre d'un compte dans WacMan. Un administrateur de compte WacMan qui essaie reçoit : « Cette adresse a un compte WiBridge sans accès à WacMan : seul le super-administrateur peut le lui ouvrir. »
- **Compte WacMan existant invité dans WiBridge** : l'accès WiBridge lui est ouvert, avec son mot de passe habituel ; il reçoit un e-mail « accès ouvert » avec le lien de connexion de WiBridge.
- **Super-administrateur** : le même compte pour les deux applications, avec les deux accès en permanence.
- **Sessions séparées** : une session WiBridge n'ouvre rien dans WacMan, et inversement. Les accès sont vérifiés à chaque requête : retirer l'accès WiBridge coupe aussitôt les sessions WiBridge, retire les appareils de confiance et annule les invitations en attente.
- **Jetons d'accès personnels de WacMan** (connecteur Claude) : sans effet sur WiBridge, et refusés pour un compte sans accès WacMan.
- **Aucun lien** entre les deux interfaces : ni menu, ni bouton, ni lien dans les e-mails.
- Le mot de passe est commun au compte : le changer dans une application vaut pour l'autre et ferme les sessions ouvertes dans les deux.

## 4. Invitation, connexion et appareils

### 4.1 Invitation
1. Le super-administrateur crée le compte : e-mail, nom, clients ouverts et droits par stream (partie 5).
2. La personne reçoit un e-mail « Activez votre compte WiBridge » avec un lien personnel, à usage unique, valable 7 jours.
3. Page d'activation : e-mail (non modifiable), nom affiché, mot de passe et confirmation. Le lien reçu par e-mail vaut vérification : l'appareil utilisé devient appareil de confiance et la personne arrive sur ses questions.

Un lien expiré, déjà utilisé ou remplacé affiche un message clair. Le super-administrateur peut renvoyer l'invitation : le lien précédent cesse de fonctionner. Le jeton du lien n'est jamais envoyé aux serveurs dans l'adresse (il est placé après le « # ») et il est retiré de la barre d'adresse dès l'ouverture de la page.

### 4.2 Connexion
1. E-mail et mot de passe (10 caractères minimum, au moins une lettre et un chiffre).
2. Sur un appareil de confiance : connexion directe.
3. Sur un nouvel appareil (« Nouvel appareil ») : code à 6 chiffres envoyé par e-mail, valable 10 minutes, 5 essais. La case « Faire confiance à cet appareil » (cochée par défaut) évite le code aux connexions suivantes.

- Un appareil de confiance le reste 180 jours après sa dernière utilisation.
- Session de 14 jours (cookie sécurisé, HttpOnly).
- Tentatives limitées : 8 par tranche de 10 minutes par adresse IP et e-mail, 20 par tranche de 30 minutes pour un même e-mail, 20 essais de code par tranche de 10 minutes par adresse IP.
- Après connexion, seul un retour vers une page de WiBridge est accepté.

**Mot de passe oublié** : code à 6 chiffres par e-mail (10 minutes, 5 essais), puis nouveau mot de passe. Toutes les sessions sont fermées et les appareils de confiance retirés. Une personne invitée qui a perdu son e-mail d'invitation peut aussi passer par là. Si l'adresse n'a pas de compte WiBridge actif (personne pas encore invitée, compte WacMan seul, accès retiré), elle reçoit à la place un e-mail qui l'explique et l'invite à demander un accès à son contact Wifirst. L'écran affiche le même message dans tous les cas, pour ne pas révéler quelles adresses ont un compte.

### 4.3 Mon compte
Menu utilisateur (rond avec les initiales), « Mon compte » :
- **Profil** : nom affiché.
- **Notifications par e-mail**, pour chaque client : « À chaque attribution », « Récapitulatif quotidien » ou « Aucun e-mail » (par défaut). Chacun active ses e-mails ici (partie 9).
- **Mot de passe** : changement (l'appareil courant reste de confiance, les autres redemandent un code).
- **Appareils de confiance** : liste (navigateur et système, date d'ajout, dernière utilisation, « cet appareil »), retrait d'un appareil ou de tous.

## 5. Droits et règles

### 5.1 Droits par client et par stream
Pour chaque client ouvert à une personne, le super-administrateur choisit :
- son **organisation** (Wifirst ou le client) : celle au nom de laquelle elle agit par défaut ;
- un **droit par défaut** pour tous les streams, et au besoin un **droit particulier** par stream.

| Droit | Effet sur les questions du stream |
|---|---|
| Masqué | La personne ne voit pas les questions qui ne relèvent que de streams masqués. |
| Lecture seule | Consultation, historique, téléchargement des pièces jointes et export. |
| Éditeur du client | Agit au nom du client (ex. « Éditeur La Poste »). |
| Éditeur Wifirst | Agit au nom de Wifirst. |
| Éditeur des deux | Agit au nom de l'une ou l'autre organisation (« Répondre au nom de »). |

Une question est visible dès que la personne voit l'un de ses streams. Le super-administrateur est éditeur des deux sur tous les streams de tous les clients.

### 5.2 Qui peut faire quoi (règles par défaut)

| Action | Éditeur Wifirst | Éditeur client | Lecture seule |
|---|---|---|---|
| Poser une question | Oui, attribuée au client par défaut (ou à Wifirst) | Oui, attribuée à Wifirst | Non |
| Modifier sujet, texte, échéance et pièces jointes de la question | Toutes les questions | Les questions qu'il a posées | Non |
| Modifier les streams | Toutes les questions, dans ses streams d'éditeur | Ses questions, dans ses streams d'éditeur | Non |
| Répondre | Questions attribuées à Wifirst ou au client | Questions attribuées au client | Non |
| Changer l'attribution sans message | Toutes les questions ouvertes | Questions attribuées au client | Non |
| Clôturer | Toutes les questions | Toutes les questions | Non |
| Rouvrir | Oui | Oui | Non |
| Modifier ou supprimer une réponse | Toutes les réponses | Ses propres réponses, à tout moment | Non |
| Supprimer une question | Les questions qu'il a posées, sans échange | Les questions qu'il a posées, sans échange | Non |

Une question doit toujours garder au moins un stream auquel la personne qui la modifie a accès. Le super-administrateur peut tout faire, supprimer toute question et restaurer une question supprimée (corbeille).

### 5.3 Règles réglables par client
Administration, client, rubrique Règles :

| Règle | Par défaut |
|---|---|
| Wifirst peut répondre aux questions attribuées au client (et les compléter à sa place) | Oui |
| Wifirst peut tout modifier : sujet, texte, streams, échéance, attribution et messages des autres | Oui |
| Le client peut rouvrir une question clôturée | Oui |
| Clôture par le client : toutes les questions, ou celles qu'il a posées ou qui lui sont attribuées | Toutes |
| E-mails de notification (attribution et récapitulatif quotidien), selon la préférence de chacun | Oui |

Sans la règle « tout modifier », un éditeur Wifirst modifie ses propres questions, répond, clôture et rouvre, mais ne change l'attribution que des questions attribuées à Wifirst et ne modifie ou ne supprime que ses propres réponses.

## 6. Questions

### 6.1 Contenu
- **Numéro** propre au client (n°1, n°2…), jamais réutilisé.
- **Sujet** (300 caractères au plus) et **texte de la question**, avec mise en forme.
- **Streams** : un ou plusieurs.
- **Posée par** : nom, organisation et date (enregistrés à la création).
- **Attribuée à** : Wifirst ou le client.
- **Statut** : À traiter, En cours, Clôturée.
- **Échéance souhaitée** (facultative).
- **Pièces jointes** de la question et de chaque message.
- **Échanges** : nombre de messages, dernier auteur et date.
- **Mise à jour** : date de la dernière activité.

### 6.2 Statuts
| Statut | Sens |
|---|---|
| À traiter | L'organisation attributaire doit agir (question nouvelle, réattribuée ou rouverte). |
| En cours | L'attributaire a répondu en conservant l'attribution : premiers éléments, réponse à compléter. |
| Clôturée | Date et auteur de la clôture affichés. |

Une question non clôturée dont l'échéance est passée est **en retard** : date en rouge et compteur « En retard ».

### 6.3 Poser une question
Bouton « Nouvelle question » : organisation au nom de laquelle la question est posée (pour un éditeur des deux), sujet, question (barre de mise en forme), streams (seuls ceux où la personne est éditeuse pour cette organisation), attribution (Wifirst choisit, le client pose toujours à Wifirst), échéance souhaitée, pièces jointes. Le bouton indique le destinataire : « Poser la question à La Poste ».

### 6.4 Répondre
Ligne dépliée, zone de réponse sous les échanges :
1. « Répondre au nom de » (si la personne peut répondre pour les deux organisations).
2. Texte de la réponse (mise en forme) et pièces jointes.
3. **Issue** :
   - « Attribuer à Wifirst » ou « Attribuer à La Poste » (l'autre organisation) : la question passe « À traiter » chez elle ;
   - « Conserver l'attribution (La Poste) » : la question reste à l'attributaire ; elle passe « En cours » si c'est l'attributaire qui répond, sinon son statut ne change pas (relance ou complément de Wifirst) ;
   - « Clôturer ».
4. « Envoyer » (« Envoyer et clôturer » si l'issue est la clôture).

Issue proposée par défaut : l'attributaire renvoie à l'autre organisation ; Wifirst qui répond à une question attribuée au client conserve l'attribution au client. Chaque message affiche son issue : « Attribuée à Wifirst », « Attribution conservée (La Poste) », « Question clôturée » ou « Rouverte, attribuée à … ». Une réponse en cours de rédaction est conservée si la liste se rafraîchit ou si la ligne est repliée.

### 6.5 Changer l'attribution, clôturer, rouvrir sans réponse
- Étiquette « Attribuée à » : un clic change l'attribution (la question repasse « À traiter »).
- Étiquette de statut : un clic propose « Clôturer la question » ou, sur une question clôturée, « Rouvrir et attribuer à … ».
- Bouton « Rouvrir la question » sous les échanges d'une question clôturée : au nom de (si les deux), motif facultatif, pièces jointes, attribution (par défaut l'autre organisation). La question repasse « À traiter » ; le motif et les pièces jointes apparaissent dans les échanges, la réouverture dans l'historique.

### 6.6 Modifier ou supprimer une réponse
Menu « ⋯ » d'une réponse, pour son auteur (et pour Wifirst avec la règle « tout modifier ») :
- **Modifier la réponse** : le texte passe en saisie (barre de mise en forme ; clic à l'extérieur ou Ctrl+Entrée pour enregistrer, Échap pour annuler). La réponse porte ensuite la mention « (modifié) ». Un clic sur le texte d'une réponse modifiable produit le même effet.
- **Supprimer la réponse**, après confirmation : le texte et les pièces jointes de la réponse sont retirés. À sa place, une mention « Réponse supprimée par … le … » garde l'issue de la réponse (par exemple « Attribuée à Wifirst »). L'attribution et le statut de la question ne changent pas : on les modifie au besoin par les étiquettes. La réponse supprimée ne compte plus dans les échanges, ni dans la recherche, ni dans l'export.

Une réponse se modifie ou se supprime à tout moment, même si d'autres réponses l'ont suivie. Le texte d'avant et le texte supprimé restent à l'historique.

### 6.7 Historique
Bouton horloge de chaque question : tout ce qui s'est passé, du plus ancien au plus récent, avec l'auteur, son organisation, la date et l'heure : création (texte, streams, échéance, pièces jointes), modifications (sujet, texte avant et après, streams, échéance), réponses et leur issue, changements d'attribution, clôtures, réouvertures, pièces jointes ajoutées ou retirées, réponses modifiées (avant et après) ou supprimées (avec le texte supprimé), suppression et restauration de la question.

### 6.8 Suppression d'une question
La personne qui a posé une question peut la supprimer tant qu'elle n'a reçu aucun échange (menu « ⋯ » de la ligne). Le super-administrateur peut supprimer toute question et la restaurer depuis la corbeille (menu de l'en-tête, « Corbeille »). Une question supprimée disparaît des listes, des recherches, des exports et des e-mails.

## 7. Écran des questions

- **En-tête** : picto et nom du client, compteurs cliquables (À traiter par La Poste, À traiter par Wifirst, En retard, Clôturées), boutons « Nouvelle question », « Fiche navette » (export Excel) et « Importer » (réimport de la fiche navette, sauf pour un lecteur). Pour le super-administrateur : Corbeille et « Configurer ce client ».
- **Mode d'emploi** repliable, texte réglable par client.
- **Recherche** : sujet, texte, échanges, nom de l'auteur et numéro, sans tenir compte des accents.
- **Filtres** : Ouvertes, Clôturées ou Toutes ; attribution (Tous, Wifirst, La Poste) ; stream ; « Mes questions » (posées par moi). Le statut, l'attribution, le stream et le tri sont mémorisés sur l'appareil ; « Réinitialiser » revient aux questions ouvertes.
- **Tableau** (écran de 1 200 px et plus) : Réf., Sujet et question, Streams, Posée par et le, Attribuée à, Statut, Échanges, Échéance, Mise à jour. Un clic sur un en-tête trie la colonne, un second clic inverse l'ordre ; tri par défaut sur la mise à jour, la plus récente en tête. Les questions sans échéance restent en fin de liste quand on trie par échéance.
- **Déplier une question** : un clic n'importe où sur la ligne (ou la carte sur mobile) déplie la question : échanges et zone de réponse. Sur le sujet ou le texte, ce premier clic ne fait que déplier ; sur une étiquette (streams, attribution, statut, échéance), il ouvre aussi le choix. La flèche, le numéro et la colonne Échanges plient et déplient. Sélectionner du texte dans la ligne ne la déplie pas. Une seule question est dépliée à la fois : en déplier une replie les autres, la question cliquée garde sa place à l'écran et une réponse en cours de rédaction est conservée.
- **Édition directe**, selon les droits : une fois la question dépliée, un clic sur le sujet ou le texte passe en saisie (barre de mise en forme, Échap pour annuler) ; streams, échéance, attribution et statut sont des étiquettes cliquables, comme dans WacMan.
- **Question dépliée** : en tête, tous les éléments de la question, modifiables selon les droits : sujet, statut, attribution, échéance (« Ajouter une échéance » si elle est vide) et streams ; puis le texte de la question, ses pièces jointes, les échanges et la zone de réponse. Elle reste affichée même si elle ne correspond plus aux filtres (clôturée ou réattribuée), jusqu'au prochain changement de filtre.
- **Lien direct** : `/c/la-poste?q=12` ouvre la question n°12.
- **Mobile et écran étroit** : une carte par question, filtres repliables, tri par liste (« Trier par »).
- La liste se rafraîchit toute seule toutes les minutes.

## 8. Pièces jointes

- Sur la question, sur une réponse et sur une réouverture ; plusieurs fichiers par envoi.
- 20 Mo au plus par fichier ; programmes et scripts refusés (.exe, .bat, .js, .sh…).
- Envoi direct à l'API, avec barre de progression, sans passer par le relais Vercel (fichiers volumineux).
- Ouverture : images et PDF s'affichent dans le navigateur, les autres fichiers se téléchargent. Le lien de téléchargement est personnel et valable 5 minutes.
- Retrait : la personne qui a déposé le fichier, tant qu'elle peut encore modifier la question ou le message, et Wifirst avec la règle « tout modifier ». Un fichier déposé mais jamais envoyé est effacé au bout de 24 heures.
- Les fichiers sont conservés dans la base PostgreSQL de Railway.

## 9. Notifications par e-mail

Expéditeur : `WiBridge <wibridge@omgt.fr>`. La personne qui agit ne reçoit jamais d'e-mail pour sa propre action. Objet du type « WiBridge La Poste : question n°12 à traiter par La Poste, Liste des ATM » ; le corps rappelle la question (numéro, sujet, extrait), le message reçu et donne le lien direct vers la question.

Par défaut, aucun e-mail de notification n'est envoyé : chacun choisit sa préférence, client par client, dans Mon compte. L'e-mail d'invitation (ou d'accès ouvert) le rappelle. Les accès ouverts avant la V1.1 sont passés à « Aucun e-mail ».

- **À chaque attribution** :
  - question attribuée à mon organisation (nouvelle question, réponse, changement d'attribution, réouverture) : envoyé aux éditeurs de cette organisation sur l'un des streams de la question ;
  - question clôturée, ou réponse qui conserve l'attribution : envoyé à la personne qui a posé la question.
- **Récapitulatif quotidien** : du lundi au vendredi à partir de 8 h (heure de Paris), la liste des questions ouvertes attribuées à mon organisation, par échéance. Rien n'est envoyé s'il n'y a rien à traiter.
- **Aucun e-mail** (par défaut).

Un client archivé ou dont la règle « E-mails de notification » est désactivée n'envoie rien. Les codes de connexion et de mot de passe oublié (ou l'e-mail « pas de compte WiBridge »), les invitations et les e-mails « accès ouvert » partent dans tous les cas.

## 10. Fiche navette (export et import Excel)

La fiche navette permet de répondre aux questions dans Excel, hors de WiBridge, puis de reverser les réponses.

### 10.1 Export
Bouton « Fiche navette » : fichier `WiBridge_<client>_fiche_navette_<date>.xlsx`, avec les questions affichées (filtres de statut, d'attribution et de stream de l'écran) et visibles par la personne.
- **Un seul onglet**, « Fiche navette » : en tête, le client, la date et l'auteur de l'export, et le mode d'emploi ; puis une question par ligne.
- Colonnes : Réf., Sujet, Question, Streams, Posée par (avec l'organisation), Posée le, Attribuée à, Statut, Échéance (en rouge si dépassée), Échanges (tous les messages, avec la date, l'auteur, l'organisation et l'issue).
- **Deux colonnes à remplir**, en jaune : « Votre réponse » et « Nouvel attribué » (liste de choix : Wifirst, La Poste ou Clôturer).
- Deux colonnes cachées, « ID » et « Version », identifient la question et sa dernière activité au moment de l'export.
- Tableau filtrable, en-tête et deux premières colonnes figés, impression en paysage sur la largeur d'une page.

### 10.2 Import
Bouton « Importer », puis choix du fichier rempli :
1. **Aperçu** : pour chaque ligne remplie, l'action prévue (par exemple « Réponse de La Poste, attribuée à Wifirst ») ou la raison pour laquelle elle sera ignorée. Les lignes sans réponse ni nouvel attribué sont passées.
2. **« Importer N lignes »** : les lignes retenues sont enregistrées, puis un compte rendu ligne par ligne s'affiche.

Règles appliquées à chaque ligne, avec les droits de la personne qui importe, comme depuis l'écran :

| Ligne remplie | Effet |
|---|---|
| Réponse, sans nouvel attribué | Réponse ; la question passe à l'autre organisation si l'attribué répond, sinon l'attribution est conservée |
| Réponse et nouvel attribué | Réponse avec cette issue (attribuer à l'autre organisation, conserver l'attribution, ou clôturer) |
| Nouvel attribué seul | Changement d'attribution, ou clôture, sans réponse |
| Question clôturée, avec un nouvel attribué | Réouverture, attribuée à cette organisation, avec la réponse comme motif |

- La réponse est enregistrée au nom de l'organisation attributaire quand la personne qui importe peut répondre en son nom (membre du client pour une question attribuée au client, éditeur des deux, super-administrateur). Sinon, Wifirst l'enregistre en son nom, comme lorsqu'il complète une question à la place du client.
- Chaque réponse importée porte la mention « fiche navette » dans les échanges, et l'historique l'indique.
- Lignes ignorées, avec leur raison : question introuvable ou supprimée, réponse que la personne n'a pas le droit de faire, nouvel attribué non reconnu, question clôturée sans nouvel attribué, question en double dans le fichier, réponse déjà présente dans les échanges (un même fichier importé deux fois n'ajoute rien).
- Avertissement, sans blocage : la question a changé depuis l'export (nouvelle réponse ou modification).
- Le texte de la colonne « Nouvel attribué » est reconnu sans tenir compte des majuscules ni des accents ; le sigle du client est accepté. Une ligne se retrouve par son identifiant caché, à défaut par son numéro.
- Limites : fichier Excel (.xlsx) de 5 Mo et 1 000 lignes au plus, 500 lignes appliquées par import.

## 11. Administration (super-administrateur)

Menu utilisateur, « Administration » :
- **Clients et streams** :
  - créer un client : picto, nom de l'espace, organisation cliente, organisation Wifirst, sigle, streams de départ (un par ligne) ;
  - modifier les mêmes champs et le mode d'emploi ; archiver (le client n'est plus ouvert aux membres) ;
  - streams : ajout (picto et nom), renommage, picto, ordre, activation ; un stream utilisé ne se supprime pas, il se désactive (il reste visible sur ses questions mais n'est plus proposé) ;
  - règles du client (partie 5.3) ;
  - « Ouvrir les questions » du client.
- **Utilisateurs et droits** : liste avec recherche, clients et droits en résumé, état (invitation envoyée, expirée ou annulée, actif avec la dernière connexion), nombre d'appareils de confiance, accès WiBridge et WacMan ; « Inviter un utilisateur » (e-mail, nom, accès WacMan, clients et droits) ; fiche d'un utilisateur : nom, accès WiBridge, accès WacMan, droits par client et par stream (organisation, droit par défaut, droits particuliers avec retour au défaut), renvoyer l'invitation, retirer les appareils de confiance.
- **Journal** : les dernières opérations de tous les clients (ou d'un client), avec la question concernée.

## 12. Robustesse et sécurité

- Les droits sont calculés par le serveur pour chaque question et renvoyés à l'écran, qui n'affiche que les actions permises ; toute autre requête est refusée. Une question hors des streams de la personne répond « introuvable », sans révéler qu'elle existe.
- Deux réponses simultanées à la même question sont traitées l'une après l'autre (verrou sur la question) : la seconde voit la nouvelle attribution.
- Un double clic n'envoie pas deux fois ; un rafraîchissement n'écrase pas un texte en cours de frappe ; une date se valide en une fois.
- Le menu d'une étiquette suit son étiquette quand la page ou une fenêtre défile (même si le défilement se termine juste après le clic) et se ferme si elle sort de l'écran.
- Une erreur d'affichage est contenue, avec les boutons Réessayer et Recharger.
- Les liens de téléchargement sont masqués dans les journaux de l'API ; les codes ne sont jamais écrits dans les journaux en production.
- Dépôts de fichiers limités à 200 par heure et par personne.

## 13. Hors périmètre de la V1.0

- Domaine personnalisé (par exemple sur un domaine Wifirst) et expéditeur des e-mails sur un domaine Wifirst.
- Connexion SSO Microsoft.
- Reprise de questions déjà échangées ailleurs (fichier Excel ou e-mails).
- Notes internes à Wifirst, invisibles du client.
- Stockage des pièces jointes hors de la base (stockage objet) si le volume grandit.
- Point d'hébergement à faire valider par Wifirst : données de La Poste (classification C2) sur les comptes Vercel et Railway d'Overdrive Management, offre Vercel Hobby réservée à un usage non commercial.

---

## Journal des évolutions (par prompt)

| Date | Demande | Effet |
|---|---|---|
| 07/10/2026 | Créer WiBridge en reprenant la configuration de WacMan (Railway, Resend, GitHub) : interface séparée et autonome sur Vercel (wibridge-wifirst.vercel.app), même backend que WacMan ; échange de questions et de demandes d'éléments entre Wifirst et son client (La Poste en premier), attribuées à l'une ou l'autre organisation, avec réponses, issues (attribuer à Wifirst, conserver l'attribution, clôturer) et réouverture ; droits Wifirst et client ; tableau trié par colonne et édition directe comme dans WacMan ; historique par question ; streams La Poste (Technico-fonctionnelle, Sécurité, Déploiement, Mainteneur Postal, Exploitation, Outillage & Data, Gouvernance) configurables ; comptes invités par le super-administrateur avec droits par client et par stream, code par e-mail sur un nouvel appareil ; comptes distincts de WacMan sauf le super-administrateur, sans lien entre les deux ; travail en autonomie et spécification | V1.0 : application `apps/bridge` (Vercel, projet `wibridge-wifirst`), routes `/api/bridge/*` de l'API commune, migration `0005_bridge` (client La Poste, 7 streams, accès du super-administrateur) ; comptes et sessions séparés de WacMan (2, 3) ; invitation, appareils de confiance et mot de passe oublié (4) ; droits par stream et règles réglables (5) ; questions, statuts, issues, réouverture, historique, corbeille (6) ; tableau, filtres, recherche, lien direct, mobile (7) ; pièces jointes (8) ; e-mails d'attribution et récapitulatif quotidien (9) ; export Excel (10) ; administration (11) |
| 07/10/2026 | Par défaut, pas de notification par e-mail pour les utilisateurs, chacun pouvant changer l'option dans ses paramètres | V1.1 : préférence « Aucun e-mail » par défaut (migration `0006_bridge_notify_default`, accès existants passés à « Aucun e-mail ») ; rappel dans les e-mails d'invitation et d'accès ; préférence toujours réglable dans Mon compte (4.3, 9) |
| 07/10/2026 | Un clic n'importe où sur une ligne de question doit déplier la question | V1.1 : clic sur la ligne ou la carte pour déplier ; sur le sujet et le texte, le premier clic ne fait que déplier, l'édition se fait ensuite ; sur une étiquette, le choix s'ouvre aussi (7) |
| 07/10/2026 | Permettre à un utilisateur de modifier ou de supprimer ses réponses | V1.1 : menu « ⋯ » d'une réponse (Modifier, Supprimer avec confirmation) ; l'auteur modifie ou supprime ses réponses à tout moment ; une réponse supprimée laisse une mention avec son issue, sans changer l'attribution ni le statut ; trace à l'historique (migration `0007_bridge_message_delete`) (5.2, 6.6, 6.7) |
| 07/10/2026 | La fonction mot de passe oublié n'envoie pas d'e-mail de réinitialisation | Constat dans les journaux : les deux demandes de 18 h n'ont déclenché aucun envoi, ce qui arrive quand l'adresse saisie n'a pas de compte WiBridge actif (vraisemblablement une personne invitée quelques minutes plus tard) ; rien ne le signalait. V1.2 : une adresse sans compte WiBridge actif reçoit un e-mail qui l'explique et indique comment demander un accès ; message de l'écran précisé (4.2, 9) |
| 09/10/2026 | Faire évoluer l'export Excel en fiche navette : un seul onglet listant les questions avec un espace pour que l'attribué réponde sur chaque question (réponse et nouvel attribué), puis réimport du fichier pour que les réponses soient prises en compte | V1.3 : export « Fiche navette » (un onglet, colonnes « Votre réponse » et « Nouvel attribué » avec liste de choix, échanges en clair, identifiants cachés, filtres de l'écran) ; bouton « Importer » avec aperçu ligne par ligne, puis application avec les droits de l'écran ; réouverture d'une question clôturée, clôture et changement d'attribution sans réponse ; mention « fiche navette » sur les réponses importées et dans l'historique ; second import du même fichier sans effet (migration `0008_bridge_message_source`) (7, 10) |
| 09/10/2026 | Dans une question dépliée, tous les éléments ne sont pas modifiables (par exemple l'échéance) : compléter | V1.4 : en tête de la question dépliée, sujet, statut, attribution, échéance et streams modifiables selon les droits, avec « Ajouter une échéance » quand elle est vide ; le texte et les pièces jointes suivent (7) |
| 09/10/2026 | Quand on déplie une question, replier les autres | V1.5 : une seule question dépliée à la fois ; la question cliquée reste à sa place à l'écran quand celle du dessus se replie ; brouillons de réponse conservés (7) |
