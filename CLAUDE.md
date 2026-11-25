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
- Capacité requise : `mobileExpense`. Sans elle, l'app l'indique et ne lit rien.

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
- Stockage de l'iPhone : `browserStorage.ts`, localStorage préfixé `ht:<envId>:` (`mobile`, `currencies`, `mex.queue`,
  `mex.lastCard`, `owner`).
- Données : lecture et écriture par `/api/s3/read` et `/api/s3/write` (`store=data`, `src/services/storage/dataStore.ts`) ;
  jamais d'accès S3 direct. `mobile/mobile.json` et les devises de `settings/exchangeRates.json` : `src/services/mobile/mobileData.ts`
  (partagés par les onglets, rechargés à la connexion, au retour au premier plan et sur « Refresh »).
- Saisies : `src/services/mobile/expenseQueue.ts`. Création, modification et annulation rangées d'abord sur l'iPhone
  (un élément par saisie, action `save` ou `cancel`, `clientUpdatedAt` toujours plus récent), puis envoyées dès que le
  proxy répond : `events/PWA-MEX_<AAAAMMJJHHMMSS>_<id>[_DEL].json` (`MOBILE_EXPENSE_SAVED` ou `MOBILE_EXPENSE_CANCELLED`,
  nom fixé au premier essai ; nouveau fichier pour une version déjà partie) puis `events/control/<eventId>.json`
  (`STORAGE_PULL_REQUESTED` version 2, `source: "iphone"`). Rien ne change pendant l'étape `written`. Un élément quitte la
  file quand `mobile.json` publie la saisie (clientUpdatedAt au moins aussi récent), ou sur le succès d'une annulation ;
  une saisie jamais partie et annulée est seulement retirée. Refus lu dans `events/status/<nom>`, affiché tel quel,
  « Discard » dans History.
- Formulaire commun `ExpenseForm.vue` (Add et modification ; `scope` : `all`, `classification`, `none`). History ouvre
  `ExpenseSheet.vue` : saisie ouverte ou refusée, tout modifiable et annulable (deux touchers) ; liée, sous-catégorie et
  commentaire seulement ; allouée, annulée, en cours d'envoi ou d'annulation : lecture seule. Heure du paiement jamais
  modifiable (choix de Michel).
- Écrans : barre d'onglets en bas (`App.vue`, sans routeur) : Add (`AddView.vue`), Budget (`BudgetView.vue`), History
  (`HistoryView.vue`).
- Le Mac calcule tout (réel, budget, non confirmé) : l'app n'additionne rien.
- Cartes nominatives : propriétaire de l'iPhone = `owner` de whoami (contrat 1.8.0), gardé pour l'usage hors ligne
  (`ht:<envId>:owner`). Add ne propose que ses cartes et History ne montre que ses saisies (`owner` de `mobile.json`,
  `ownPaymentMeans` / `ownEntries`) ; Budget reste commun. Sans propriétaire : aucune carte, message explicite.
- Pièces reprises de HomeTools (`proxyClient`, `proxyKeyVault`, `environmentGuard`, `contracts/environment.ts`,
  `contracts/read.ts`) : garder le même comportement ; une correction faite d'un côté se reporte de l'autre.
- Interface en anglais, commentaires en français. Champs à 16 px au moins (pas de zoom Safari), zones sûres
  (`--safe-top`, `--safe-bottom`), mode sombre selon l'iPhone.

## Étapes prévues (lot M2 côté iPhone)

1. Squelette : connexion, clé, lecture de `mobile.json` (fait).
2. Saisie d'une dépense avec file d'attente hors ligne, devise modifiable, onglets, History (fait).
3. Modification et annulation d'une saisie depuis History (`MOBILE_EXPENSE_SAVED`, `MOBILE_EXPENSE_CANCELLED`) (fait).
4. Réel face au budget : barres par sous-catégorie, part « non confirmé » hachurée, vue mois et vue année.

## Règles de travail

- Fichiers complets et propres, prêts pour la production : aucun reliquat de POC, code de test ou code commenté transitoire.
- Travail par petites étapes : une modification, vérification (build + type-check), puis on continue.
- Michel décide de l'architecture : proposer les options et attendre son accord avant tout changement structurel.
- Ne pas commiter depuis une session (ni depuis VSCode) : préparer les modifications, puis Michel lance dans myTooling
  (projet iHomeTools) **Commit + Tag**, avec « Deliver afterwards » pour livrer. Commit + Tag refuse un dossier sans
  modification, et Deliver exige que HEAD soit exactement le dernier tag : un commit fait hors de myTooling bloque les deux
  jusqu'à la modification suivante.
- Ne jamais lire ni afficher de fichier `.env*` ou contenant des secrets.
