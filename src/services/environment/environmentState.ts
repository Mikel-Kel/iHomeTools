import { ref, shallowRef } from "vue";

import type { Capabilities, EnvironmentInfo } from "@/contracts/environment";

/* =========================
   Environnement de l'appareil

   Renseigné par /api/whoami au démarrage
   (environmentGuard.ts). L'environnement est « établi » une
   fois connu et tant qu'il n'est pas bloqué. Avant, seul
   /api/whoami part vers le proxy (proxyClient.ts) et les
   écrans ne sont pas montés (App.vue).

   Hors ligne : l'environnement sous lequel la clé du proxy
   est rangée (storedEnvId, lu dans le coffre avant whoami)
   suffit pour ouvrir l'app avec les données gardées sur
   l'iPhone et mettre les saisies en attente ; « unreachable »
   n'est alors qu'un bandeau (App.vue).

   Blocages, affichés par AppUnavailable.vue :
   - error : refus du proxy (§5.4) ou réponse inexploitable ;
     code null quand l'erreur vient de l'app ;
   - contract : MAJOR du contrat différent de celui de l'app ;
   - changed : l'appareil a changé d'environnement en cours
     de session ;
   - unreachable : le proxy ne répond pas (Tailscale coupé,
     Mac en veille) ;
   - key : clé du proxy absente de l'appareil, ou refusée
     (rejected) ; attend sa saisie.
========================= */

export type EnvironmentBlock =
  | { kind: "error"; code: string | null; message: string }
  | { kind: "contract"; proxyVersion: string }
  | { kind: "changed"; expected: string; received: string }
  | { kind: "unreachable" }
  | { kind: "key"; rejected: boolean };

export const environment =
  shallowRef<EnvironmentInfo | null>(null);

/*
  Propriétaire de l'appareil (whoami, contrat §3.3) : l'app ne
  propose que ses cartes et ne montre que ses saisies. Hors
  ligne, le dernier connu (environmentGuard.ts). null : pas
  déclaré dans environments.json.
*/
export const deviceOwner =
  ref<string | null>(null);

export const environmentBlock =
  shallowRef<EnvironmentBlock | null>(null);

/* Environnement de la clé rangée dans le coffre, puis celui de whoami. */
export const storedEnvId =
  ref<string | null>(null);

/* Environnement du stockage de l'iPhone : connu par whoami, sinon par le coffre. */
export function localEnvId(): string | null {
  return environment.value?.env ?? storedEnvId.value;
}

/*
  L'app peut s'ouvrir : environnement connu, ou seulement
  injoignable (ou en cours de vérification) avec une clé
  déjà rangée.
*/
export function appUsable(): boolean {
  const block =
    environmentBlock.value;

  return (
    environment.value !== null ||
    (
      storedEnvId.value !== null &&
      (block === null || block.kind === "unreachable")
    )
  );
}

export function environmentEstablished(): boolean {
  return (
    environment.value !== null &&
    environmentBlock.value === null
  );
}

/* Capacités de l'environnement (§3.4) : faux tant qu'il n'est pas connu. */
export function hasCapability(
  name: keyof Capabilities
): boolean {
  return environment.value?.capabilities[name] === true;
}

/*
  Nom de l'appareil pour le champ source des événements :
  celui que déclare environments.json (whoami), sinon
  « iPhone ».
*/
export function deviceName(): string {
  return environment.value?.device || "iPhone";
}

/* Contrat incompatible ou environnement changé : seul un rechargement en sort. */
export function requiresReload(
  block: EnvironmentBlock | null
): boolean {
  return (
    block?.kind === "contract" ||
    block?.kind === "changed"
  );
}

export function blockEnvironment(
  block: EnvironmentBlock
) {
  if (!requiresReload(environmentBlock.value)) {
    environmentBlock.value = block;
  }
}
