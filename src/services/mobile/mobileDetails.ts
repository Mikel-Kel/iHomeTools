import {
  ref,
  shallowRef,
  watch,
} from "vue";

import {
  DETAILS_FILE,
  DETAILS_FOLDER,
  readMobileDetails,
  type MobileDetails,
} from "@/contracts/details";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import {
  environmentEstablished,
  storedEnvId,
} from "@/services/environment/environmentState";

import { mobileData } from "@/services/mobile/mobileData";

import { readDataJson } from "@/services/storage/dataStore";

import { log } from "@/utils/logger";

/* =========================
   Détail des montants de Follow-up (mobile/details.json)

   Lu seulement à l'ouverture d'un détail (DetailSheet.vue),
   jamais avec la relecture fréquente de mobile.json : relu
   si la copie gardée n'a pas le generatedAt de mobile.json
   affiché (les deux fichiers partent ensemble, contrat
   § 5.1), donc aussi pendant qu'un détail est ouvert quand
   mobile.json change.

   Copie gardée sur l'iPhone (ht:<envId>:mobile.details) :
   hors ligne, le dernier détail reçu reste lisible. Échec de
   lecture : copie précédente, message à côté.
========================= */

const DETAILS_CACHE = "mobile.details";

export const mobileDetails =
  shallowRef<MobileDetails | null>(null);

export const detailsLoading =
  ref(false);

/* details.json absent : pas encore publié par le Mac. */
export const detailsMissing =
  ref(false);

export const detailsError =
  ref("");

let restoredFor: string | null = null;

let running = false;

function restoreCache() {
  const env =
    storedEnvId.value;

  if (restoredFor === env) {
    return;
  }

  restoredFor = env;
  mobileDetails.value = readStored(DETAILS_CACHE, readMobileDetails);
}

/* Vrai si la copie gardée correspond à mobile.json affiché. */
function upToDate(): boolean {
  return (
    mobileDetails.value !== null &&
    mobileDetails.value.generatedAt === mobileData.value?.generatedAt
  );
}

export async function loadMobileDetails() {
  restoreCache();

  if (running || upToDate() || !environmentEstablished()) {
    return;
  }

  running = true;
  detailsLoading.value = true;

  try {
    const raw =
      await readDataJson(`${DETAILS_FOLDER}/${DETAILS_FILE}`);

    detailsMissing.value =
      raw === null;

    if (raw !== null) {
      mobileDetails.value = readMobileDetails(raw);
      writeStored(DETAILS_CACHE, raw);
    }

    detailsError.value = "";

  } catch (err) {
    log.warn("[Mobile] details not read", err);

    detailsError.value =
      err instanceof Error
        ? err.message
        : String(err);

  } finally {
    running = false;
    detailsLoading.value = false;
  }
}

/* Autre environnement : la copie de l'environnement précédent n'est plus valable. */
watch(
  storedEnvId,

  () => {
    restoredFor = null;
    mobileDetails.value = null;
    detailsMissing.value = false;
    detailsError.value = "";
  }
);
