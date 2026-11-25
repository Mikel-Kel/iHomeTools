import { shallowRef } from "vue";

import type { Capabilities, EnvironmentInfo } from "@/contracts/environment";

/* =========================
   Environnement de l'appareil

   Renseigné par /api/whoami au démarrage
   (environmentGuard.ts). L'environnement est « établi » une
   fois connu et tant qu'il n'est pas bloqué. Avant, seul
   /api/whoami part vers le proxy (proxyClient.ts) et les
   écrans ne sont pas montés (App.vue).

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

export const environmentBlock =
  shallowRef<EnvironmentBlock | null>(null);

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
