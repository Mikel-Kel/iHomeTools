import {
  shallowRef,
  watch,
} from "vue";

import {
  APP_STATUS_FILE,
  APP_STATUS_FOLDER,
  readAppStatus,
} from "@/contracts/appStatus";

import {
  environment,
  environmentEstablished,
} from "@/services/environment/environmentState";

import { readDataJson } from "@/services/storage/dataStore";

import { log } from "@/utils/logger";

/* =========================
   Maintenance

   settings/appStatus.json (contrat :
   ../Backend/docs/app-status-contract.md). Contrairement à
   HomeTools, l'iPhone n'est pas bloqué (choix de Michel) :
   bandeau avec le message (App.vue) ; les saisies restent
   sur l'iPhone et ne partent qu'à la fin de la maintenance
   (expenseQueue.ts).

   Contrôle dès que l'environnement est établi, au retour au
   premier plan et toutes les 5 minutes ; toutes les minutes
   pendant une maintenance. Au plus un contrôle par minute.
   Fichier absent ou illisible : pas de maintenance. Proxy
   injoignable : état précédent gardé, réessayé au
   déclencheur suivant.
========================= */

export interface Maintenance {
  message: string;
  since: string | null;
}

const MIN_INTERVAL_MS =
  60 * 1000;

const PERIODIC_CHECK_MS =
  5 * 60 * 1000;

/* null : pas de maintenance. */
export const maintenance =
  shallowRef<Maintenance | null>(null);

let lastCheckAt = 0;

let running = false;

export async function checkAppStatus() {
  if (
    running ||
    !environmentEstablished() ||
    Date.now() - lastCheckAt < MIN_INTERVAL_MS
  ) {
    return;
  }

  running = true;
  lastCheckAt = Date.now();

  try {
    const status =
      readAppStatus(
        await readDataJson(`${APP_STATUS_FOLDER}/${APP_STATUS_FILE}`)
      );

    maintenance.value =
      status.maintenance
        ? { message: status.message, since: status.since }
        : null;

  } catch (err) {
    log.warn("[AppStatus] check skipped", err);

  } finally {
    running = false;
  }
}

/* Posé une fois au démarrage (main.ts). */
export function startAppStatusWatch() {
  watch(
    environment,

    (current, previous) => {
      if (current && !previous) {
        void checkAppStatus();
      }
    }
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkAppStatus();
    }
  });

  window.setInterval(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    if (maintenance.value || Date.now() - lastCheckAt >= PERIODIC_CHECK_MS) {
      void checkAppStatus();
    }
  }, MIN_INTERVAL_MS);
}
