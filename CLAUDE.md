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
- Démarrage : `GET /api/whoami` d'abord (`src/services/environment/`), écran bloquant `AppUnavailable.vue` en cas de refus,
  de clé absente ou de proxy injoignable ; relance toutes les minutes et au retour au premier plan.
- Données : lecture par `/api/s3/read` (`store=data`, `src/services/storage/dataStore.ts`) ; jamais d'accès S3 direct.
  `mobile/mobile.json` chargé par `useMobileData` au lancement, au retour au premier plan et sur « Refresh ».
- Le Mac calcule tout (réel, budget, non confirmé) : l'app n'additionne rien.
- Pièces reprises de HomeTools (`proxyClient`, `proxyKeyVault`, `environmentGuard`, `contracts/environment.ts`,
  `contracts/read.ts`) : garder le même comportement ; une correction faite d'un côté se reporte de l'autre.
- Interface en anglais, commentaires en français. Champs à 16 px au moins (pas de zoom Safari), zones sûres
  (`--safe-top`, `--safe-bottom`), mode sombre selon l'iPhone.

## Étapes prévues (lot M2 côté iPhone)

1. Squelette : connexion, clé, lecture de `mobile.json` (fait).
2. Saisie d'une dépense avec file d'attente hors ligne (`MOBILE_EXPENSE_SAVED`, `STORAGE_PULL_REQUESTED`).
3. Réel face au budget : barres par sous-catégorie, part « non confirmé » hachurée, vue mois et vue année.

## Règles de travail

- Fichiers complets et propres, prêts pour la production : aucun reliquat de POC, code de test ou code commenté transitoire.
- Travail par petites étapes : une modification, vérification (build + type-check), puis on continue.
- Michel décide de l'architecture : proposer les options et attendre son accord avant tout changement structurel.
- Ne pas commiter depuis une session (ni depuis VSCode) : préparer les modifications, puis Michel lance dans myTooling
  (projet iHomeTools) **Commit + Tag**, avec « Deliver afterwards » pour livrer. Commit + Tag refuse un dossier sans
  modification, et Deliver exige que HEAD soit exactement le dernier tag : un commit fait hors de myTooling bloque les deux
  jusqu'à la modification suivante.
- Ne jamais lire ni afficher de fichier `.env*` ou contenant des secrets.
