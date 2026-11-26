import {
  ref,
  watch,
} from "vue";

import { DEFAULT_WARNING_PERCENT } from "@/contracts/appParameters";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import { storedEnvId } from "@/services/environment/environmentState";

/* =========================
   Réglages de Follow-up

   Marge d'alerte (followUp.warningPercent
   d'AppParameters.json, lu avec la version de référence par
   versionGuard.ts) ; gardée sur l'iPhone
   (ht:<envId>:followUp.warningPercent) pour l'usage hors
   ligne. 10 tant que rien n'est lu.
========================= */

const WARNING_CACHE = "followUp.warningPercent";

export const warningPercent =
  ref(DEFAULT_WARNING_PERCENT);

export function setWarningPercent(
  value: number
) {
  warningPercent.value = value;
  writeStored(WARNING_CACHE, value);
}

/* Posé une fois au démarrage (main.ts). */
export function startFollowUpSettings() {
  watch(
    storedEnvId,

    env => {
      if (env) {
        warningPercent.value =
          readStored(WARNING_CACHE, raw => (typeof raw === "number" && raw > 0 && raw < 100 ? raw : null)) ??
          DEFAULT_WARNING_PERCENT;
      }
    },

    {
      immediate: true,
    }
  );
}
