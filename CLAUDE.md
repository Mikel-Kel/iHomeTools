# iHomeTools — web app iPhone (front-end)

Application personnelle, **iPhone uniquement**, compagnon de HomeTools : saisie des dépenses par carte au moment du
paiement (Twint en seconde phase) et réel face au budget pour les sous-catégories choisies.
Développeur unique : Michel.

Repos liés : HomeTools (PWA Mac / iPad) dans `../HomeTools`, backend AppleScript et Python dans `../Backend`, proxy Flask
dans `../hometools-proxy`. Chacun a son propre CLAUDE.md.

## Contrats

- Contrat métier : `../Backend/docs/mobile-expense-contract.md` (saisies, événements `PWA-MEX_…`, export
  `mobile/mobile.json`, réel et budget, liaison au mouvement). Lecteur : `src/contracts/mobile.ts`.
- Contrat multi-environnements : `contracts/MULTI_ENV_CONTRACT.md` (copie ; la canonique est dans
  `../hometools-proxy/contracts/`). Ne jamais la modifier ici sans la modifier d'abord là-bas.
- Capacité requise : `mobileExpense`. Sans elle, l'app l'indique et ne lit rien. Capacité `receiptRead` (contrat
  1.9.0) : bouton « Scan receipt » d'Add, masqué sans elle.

## Stack

- Vue 3 + TypeScript + Vite, sans routeur. Alias `@/` → `src/`, base `/iHomeTools/` en production.
- Web app de l'écran d'accueil iOS (manifest + balises meta) ; **pas de service worker**.
- Déployée sur GitHub Pages : `https://mikel-kel.github.io/iHomeTools/`, même origine que HomeTools (le proxy
  l'accepte déjà en CORS). Coffre de la clé propre à l'app (`ihometools-vault`).
- **Le repo est public** → aucun secret, aucune donnée réelle (cartes, porteurs, montants) dans le code ni les exemples.
  - `.env.local` (ignoré) : `VITE_PROXY_URL`. Toute variable `VITE_*` finit en clair dans le bundle public.
  - La clé du proxy n'est jamais dans le build : saisie une fois sur l'iPhone, rangée chiffrée (`proxyKeyVault.ts`).
- Commandes : `npm run dev` (http://localhost:5173), `npm run build` (`vue-tsc -b && vite build`). Pas de tests ni de lint.
  `noUnusedLocals` / `noUnusedParameters` : tout code inutilisé fait échouer le build.
- Après chaque modification du code : vérifier que le build passe (type-check inclus) avant de rendre la main.

## Architecture

- Réseau : uniquement le proxy, via Tailscale (`proxyFetch`, `src/services/proxy/proxyClient.ts`, seul module qui lit
  `VITE_PROXY_URL` et envoie `X-Proxy-Key`). L'iPhone doit être déclaré dans `identities` de `environments.json` du proxy.
- Démarrage : `GET /api/whoami` d'abord (`src/services/environment/`), relance toutes les minutes et au retour au
  premier plan. Écran bloquant `AppUnavailable.vue` en cas de refus, de clé absente ou refusée, de contrat incompatible.
- **Hors ligne** (choix de Michel) : proxy injoignable avec une clé déjà rangée → l'app s'ouvre quand même
  (`appUsable`), sous l'environnement du coffre (`storedEnvId`), avec les dernières données gardées ; bandeau d'état
  dans `App.vue`.
- Version (mêmes règles que HomeTools, `src/services/version/versionGuard.ts`) : `__APP_VERSION__` comparée à
  `iHomeToolsVersion` de `settings/AppParameters.json` (écrite par myTooling à chaque Deliver ; avec `followUp.warningPercent`, seules clés lues) ;
  contrôle à la connexion, au retour au premier plan et toutes les 5 min (au plus une fois par minute ; HomeTools : 30 et
  5 min, différence voulue par Michel). App plus ancienne :
  bandeau « Reload » (attend la fin d'un envoi, recharge avec `?v=<version>`) / « Later » (30 min). Référence absente
  ou illisible : rien.
- Maintenance (`settings/appStatus.json`, contrat `../Backend/docs/app-status-contract.md`,
  `src/services/appStatus/appStatusGuard.ts`) : **pas de blocage** (choix de Michel), bandeau avec le message ; la file
  ne part pas pendant la maintenance, envoi dès sa fin. Contrôle toutes les 5 min, toutes les minutes pendant une
  maintenance.
- Stockage de l'iPhone : `browserStorage.ts`, localStorage préfixé `ht:<envId>:` (`mobile`, `currencies`, `mex.queue`,
  `mex.lastCard`, `owner`, `subCategoryLabels`, `parties`, `budget.period`, `mobile.details`).
- Données : lecture et écriture par `/api/s3/read` et `/api/s3/write` (`store=data`, `src/services/storage/dataStore.ts`) ;
  jamais d'accès S3 direct. `mobile/mobile.json` et les devises de `settings/exchangeRates.json` : `src/services/mobile/mobileData.ts`
  (partagés par les onglets, rechargés à la connexion, au retour au premier plan et sur « Refresh » ; `mobile.json` seul,
  sans « Loading… », toutes les 15 secondes tant que l'app est à l'écran et après le succès d'une saisie envoyée).
  Parties de `settings/parties.json` (commerçant, contrat mobile v0.9, environ 440 Ko, lecteur `src/contracts/parties.ts`,
  copie réduite gardée) : relues seulement à la connexion, sur « Refresh » et après un refus du Mac.
- Saisies : `src/services/mobile/expenseQueue.ts`. Création, modification et annulation rangées d'abord sur l'iPhone
  (un élément par saisie, action `save` ou `cancel`, `clientUpdatedAt` toujours plus récent), puis envoyées dès que le
  proxy répond : `events/PWA-MEX_<AAAAMMJJHHMMSS>_<id>[_DEL].json` (`MOBILE_EXPENSE_SAVED` ou `MOBILE_EXPENSE_CANCELLED`,
  nom fixé au premier essai ; nouveau fichier pour une version déjà partie) puis `events/control/<eventId>.json`
  (`STORAGE_PULL_REQUESTED` version 2, `source: "iphone"`). Rien ne change pendant l'étape `written`. Un élément quitte la
  file quand `mobile.json` publie la saisie (clientUpdatedAt au moins aussi récent), ou sur le succès d'une annulation ;
  une saisie jamais partie et annulée est seulement retirée. Refus lu dans `events/status/<nom>`, affiché tel quel,
  « Discard » dans History.
- Formulaire commun `ExpenseForm.vue` (Add et modification ; `scope` : `all`, `classification`, `none`). History ouvre
  `ExpenseSheet.vue` : saisie ouverte ou refusée, tout modifiable et annulable (deux touchers) ; liée, sous-catégorie,
  commerçant et commentaire seulement, annulable (le Mac défait la liaison) ; allouée, annulée, en cours d'envoi ou d'annulation :
  lecture seule. Date du paiement choisie
  dans Add (aujourd'hui par défaut, 60 jours en arrière au plus, heure de l'enregistrement) et modifiable tant que la
  saisie est ouverte ou refusée (même heure) ; l'heure n'est jamais choisie (choix de Michel).
- Ticket de caisse (contrat multi-environnements 1.9.0, § 5.3, `src/contracts/receipt.ts`,
  `src/services/receipt/receiptReader.ts`) : « Scan receipt » d'Add (proxy joignable et `receiptRead`), photo prise ou
  choisie, réduite à 1500 px en JPEG, envoyée à `POST /api/receipt/read` (le proxy appelle Haiku 5.5, rien n'est
  gardé). `ExpenseForm.prefill` reprend la carte (la seule du propriétaire dont `cardDigits`, contrat mobile v0.13,
  est celui du ticket ; aucune ou plusieurs : carte gardée, signalé), montant, devise proposée, date dans les limites et commerçant (partie
  retrouvée par `merchantBrand`, sinon par le texte du ticket, mots entiers ; sinon texte libre) ;
  sous-catégorie (sauf si elle ne va plus avec la carte) et commentaire inchangés. Note « check before saving » avec ce qui n'est pas repris, cash ou TWINT
  signalés ; Michel confirme toujours.
- Écrans : barre d'onglets en bas (`App.vue`, sans routeur) : Add (`AddView.vue`), Follow-up
  (`BudgetView.vue`), Expenses (`HistoryView.vue`) ; noms internes Budget et History dans le code.
- Le Mac calcule tout (réel, budget, non confirmé) : l'app ne fait aucun total ni agrégat. Seule exception (choix de
  Michel) : l'écart d'une ligne de Follow-up, budget − (réel + non confirmé).
- Budget (`BudgetView.vue`, barres `BudgetBar.vue`) : Month (mois courant du Mac, flèches ‹ › vers les 12 derniers mois
  de `months`, contrat v0.5, jamais additionnés ; rouvre sur le mois courant), Year to date (réel face au budget
  à date, barre jusqu'à lui) ou Year (réel face au budget de l'année, repère vertical au budget à date ; rien de
  répété entre les deux vues) ; choix gardé (`budget.period` : `month`, `ytd`, `year`).
  Réel plein, non confirmé hachuré, seule la part au-delà du budget en rouge. Écart « N left » / « N over » au budget
  de la vue : vert sous (100 − p) %, orange jusqu'à 100 %, rouge au-delà, rien sans budget ; p =
  `followUp.warningPercent` d'`AppParameters.json` (10 par défaut), lu avec la version, gardé
  (`followUp.warningPercent`, `src/services/settings/followUpSettings.ts`).
  En-tête de période commun : `PeriodHeader.vue`.
- Hors suivi (contrat mobile v0.10) : cartes et catégories `tracked: false`, dépenses personnelles sans budget ni
  liaison. Add propose les sous-catégories suivies comme la carte choisie (changer de carte efface une sous-catégorie
  qui ne correspond plus) et choisit d'avance la seule possible, sinon la plus utilisée dans les saisies du
  propriétaire de `mobile.json` ; saisie `recorded` (« Recorded »), tout modifiable et annulable. Follow-up : une seule carte
  (pas de rupture de présentation, choix de Michel) : catégories suivies, puis intertitre « Personal », mêmes lignes
  sans barre (« No budget ») et total `untrackedTotals` du propriétaire (calculé par le Mac), dans les trois vues
  (Year = Year to date).
- Propriétaire (contrat mobile v0.4) : propriétaire de l'iPhone = `owner` de whoami (contrat 1.8.0), gardé pour l'usage
  hors ligne (`ht:<envId>:owner`). Add ne propose que ses cartes (`owner`) et ses sous-catégories (`owners`), Budget ne
  montre que ses sous-catégories (montants communs au ménage), History que ses saisies (`ownPaymentMeans`,
  `ownSubCategories`, `ownEntries`). Sans propriétaire, carte ou sous-catégorie : message explicite, pas de saisie.
  Une carte s'identifie par `cardId` (libellé unique par propriétaire seulement) ; pastille de sa couleur (`color`,
  neutre si `null`). Sous-catégorie retirée : dernier libellé connu (`subCategoryLabel`, `subCategoryLabels`). Après
  un refus, `mobile.json` est relu.
- Pièces reprises de HomeTools (`proxyClient`, `proxyKeyVault`, `environmentGuard`, `contracts/environment.ts`,
  `contracts/read.ts`, `contracts/appStatus.ts`) : garder le même comportement ; une correction faite d'un côté se reporte de l'autre.
- Interface en anglais, commentaires en français. Champs à 16 px au moins (pas de zoom Safari), zones sûres
  (`--safe-top`, `--safe-bottom`), mode sombre selon l'iPhone.

## Étapes prévues (lot M2 côté iPhone)

1. Squelette : connexion, clé, lecture de `mobile.json` (fait).
2. Saisie d'une dépense avec file d'attente hors ligne, devise modifiable, onglets, History (fait).
3. Modification et annulation d'une saisie depuis History (`MOBILE_EXPENSE_SAVED`, `MOBILE_EXPENSE_CANCELLED`) (fait).
4. Réel face au budget : barres par sous-catégorie, part « non confirmé » hachurée, vue mois et vue année (fait).
5. Contrat mobile v0.4 : couleur des cartes, sous-catégories par propriétaire (fait).
6. Contrat mobile v0.5 : navigation sur les 12 derniers mois ; saisies annulées purgées chaque nuit par le Mac (fait).
7. Lot M3 (contrat v0.6, liaison au mouvement) : aucun nouveau champ ; mouvement lié affiché dans Expenses (date,
   texte, montant payé en positif, jamais comparé à la saisie ; rappel de la carte du paiement retiré ensuite, choix de Michel)
   (fait).
8. Date du paiement saisissable dans Add (aujourd'hui par défaut) et modifiable sur une saisie pas encore liée (fait).
9. Annulation d'une saisie liée, pas encore allouée (contrat mobile § 4.2, Backend d'abord) (fait).
10. Contrat mobile v0.9 : commerçant facultatif (`MerchantField.vue`) : partie cherchée dans `parties.json` (libellé et
    alias, sans casse ni accents) ou texte libre (`partyId` ou `partyName`, 100 caractères au plus), modifiable sur
    une saisie liée, affiché dans Expenses (fait).
11. Contrat mobile v0.10 : cartes et catégories hors suivi, état `recorded`, section Personal de Follow-up (fait).
12. Contrat mobile v0.12 : détail d'une sous-catégorie dans Follow-up (toucher une ligne, `DetailSheet.vue`) :
    lignes de `mobile/details.json` (`src/contracts/details.ts`, `src/services/mobile/mobileDetails.ts`) de la période
    montrée, dans l'ordre du Mac, commentaire sinon texte de la banque, « Unconfirmed », aucun total. Lu seulement à
    l'ouverture d'un détail, relu si son `generatedAt` diffère de celui de `mobile.json` ; copie gardée hors ligne
    (fait).

13. Lecture d'un ticket de caisse, lot R1 (contrat multi-environnements 1.9.0, proxy fait) : « Scan receipt » dans
    Add, préremplissage sans la carte (fait). Lot R2 : carte retrouvée par `cardDigits` (contrat mobile v0.13 ; v0.14 :
    cartes clôturées jamais publiées, rien à faire) (fait).

## Backlog

- **Lecture d'un ticket de caisse** (validé par Michel, 2026-11-27 ; lots R1 et R2 faits) : bouton
  « Scan receipt » dans Add, photo réduite (~1500 px, JPEG) envoyée au proxy (`POST /api/receipt/read`, capacité à
  ajouter au contrat multi-environnements, canonique dans `../hometools-proxy`). Le proxy appelle l'API Claude (SDK
  Python `anthropic`, sortie JSON imposée : `date`, `time`, `amount`, `currency`, `cardDigits`, `merchant`, `null` si
  illisible) avec une clé API de la Claude Console (facturée à part de l'abonnement claude.ai, limite de dépense
  basse), rangée sur la machine du proxy seulement. Rien n'est gardé ; le formulaire est seulement prérempli, Michel
  confirme. Sortie : aussi `paymentMethod` (`card`, `cash`, `twint`, `other`) et `merchantBrand` (nom usuel, pour
  retrouver la partie dans `parties.json`).
  POC du 2026-11-28 (3 vrais tickets, photo 1500 px, effort `low`, script hors repo) : Opus 5.5 et Haiku 5.5 justes
  sur tous les champs utiles, cash reconnu ; Haiku 1,3 à 2,3 s pour environ 0,03 centime par ticket → **Haiku 5.5
  retenu**, à revoir sur des tickets plus difficiles (papier thermique pâli, froissé, devise, capture TWINT).
  Étape 2, carte : 4 derniers caractères de `CardInternalID` (champ Card existant, choix de Michel : rien à saisir),
  publiés par le Mac dans `paymentMeans[].cardDigits` de `mobile.json` (contrat mobile v0.13) ; aucune ou plusieurs
  cartes du propriétaire avec ces chiffres : carte choisie gardée, signalé.
- **TWINT (lot M4)** : une web app ne lit rien de l'app TWINT (pas d'API pour un particulier, pas de partage vers une
  web app). Pistes : TWINT comme moyen de paiement dans Add, lié au mouvement « TWINT … » de l'import bancaire (règle
  de liaison à définir avec le Backend) ; capture d'écran de la confirmation lue comme un ticket ; export de
  l'historique depuis l'app TWINT, s'il existe (à vérifier).
- **Raccourci iOS « Transaction »** (iOS 17+, paiements Apple Pay par carte du Wallet, pas TWINT) : l'automatisation
  ouvre l'app avec Add prérempli (`?amount=…&card=…&merchant=…`) ; l'app lit ces paramètres à l'ouverture. À vérifier
  sur l'iPhone : disponibilité pour les cartes de Michel et données transmises.

## Règles de travail

- Fichiers complets et propres, prêts pour la production : aucun reliquat de POC, code de test ou code commenté transitoire.
- Travail par petites étapes : une modification, vérification (build + type-check), puis on continue.
- Michel décide de l'architecture : proposer les options et attendre son accord avant tout changement structurel.
- Ne pas commiter depuis une session (ni depuis VSCode) : préparer les modifications, puis Michel lance dans myTooling
  (projet iHomeTools) **Commit + Tag**, avec « Deliver afterwards » pour livrer. Commit + Tag refuse un dossier sans
  modification, et Deliver exige que HEAD soit exactement le dernier tag : un commit fait hors de myTooling bloque les deux
  jusqu'à la modification suivante.
- Ne jamais lire ni afficher de fichier `.env*` ou contenant des secrets.
