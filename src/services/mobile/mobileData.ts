import {
  ref,
  shallowRef,
  watch,
} from "vue";

import {
  BASE_CURRENCY,
  EXCHANGE_RATES_FILE,
  EXCHANGE_RATES_FOLDER,
  MOBILE_FILE,
  MOBILE_FOLDER,
  readExchangeCurrencies,
  readMobileData,
  type MobileData,
} from "@/contracts/mobile";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import {
  environment,
  environmentEstablished,
  storedEnvId,
} from "@/services/environment/environmentState";

import { readDataJson } from "@/services/storage/dataStore";

import { log } from "@/utils/logger";

/* =========================
   Données publiées par le Mac pour l'iPhone

   mobile/mobile.json et les devises de
   settings/exchangeRates.json, partagés par tous les
   onglets. Copie gardée sur l'iPhone (ht:<envId>:mobile et
   ht:<envId>:currencies) : l'app s'ouvre hors ligne avec les
   dernières données reçues.

   Rechargés dès que l'environnement est établi, au retour au
   premier plan et sur demande (refresh). Les données déjà
   affichées restent en place pendant un rechargement et
   après un échec : l'écran ne clignote pas.
========================= */

const MOBILE_CACHE = "mobile";

const CURRENCIES_CACHE = "currencies";

export const mobileData =
  shallowRef<MobileData | null>(null);

export const currencies =
  ref<string[]>([BASE_CURRENCY]);

export const mobileLoading =
  ref(false);

/* mobile.json absent : pas encore publié par le Mac. */
export const mobileMissing =
  ref(false);

export const mobileError =
  ref("");

/* Abonnés prévenus après chaque lecture réussie (file d'attente). */
const listeners =
  new Set<(data: MobileData) => void>();

export function onMobileData(
  listener: (data: MobileData) => void
) {
  listeners.add(listener);
}

function restoreCache() {
  const cached =
    readStored(MOBILE_CACHE, readMobileData);

  if (cached) {
    mobileData.value = cached;
  }

  const cachedCurrencies =
    readStored(CURRENCIES_CACHE, readExchangeCurrencies);

  if (cachedCurrencies) {
    currencies.value = cachedCurrencies;
  }
}

/* Fichier des cours absent ou illisible : devises précédentes. */
async function refreshCurrencies() {
  try {
    const raw =
      await readDataJson(`${EXCHANGE_RATES_FOLDER}/${EXCHANGE_RATES_FILE}`);

    if (raw !== null) {
      currencies.value = readExchangeCurrencies(raw);
      writeStored(CURRENCIES_CACHE, raw);
    }
  } catch (err) {
    log.warn("[Mobile] exchange rates not read", err);
  }
}

export async function refreshMobileData() {
  if (mobileLoading.value || !environmentEstablished()) {
    return;
  }

  mobileLoading.value = true;

  try {
    const raw =
      await readDataJson(`${MOBILE_FOLDER}/${MOBILE_FILE}`);

    mobileMissing.value =
      raw === null;

    if (raw !== null) {
      const data =
        readMobileData(raw);

      mobileData.value = data;
      writeStored(MOBILE_CACHE, raw);

      listeners.forEach(listener => listener(data));
    }

    mobileError.value = "";

    await refreshCurrencies();

  } catch (err) {
    mobileError.value =
      err instanceof Error
        ? err.message
        : String(err);

  } finally {
    mobileLoading.value = false;
  }
}

/* Posé une fois au démarrage (main.ts). */
export function startMobileDataWatch() {
  watch(
    storedEnvId,

    env => {
      if (env && !mobileData.value) {
        restoreCache();
      }
    },

    {
      immediate: true,
    }
  );

  watch(
    environment,

    (current, previous) => {
      if (current && !previous) {
        void refreshMobileData();
      }
    }
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshMobileData();
    }
  });
}
