import {
  computed,
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
  type MobileEntry,
  type MobileSubCategory,
  type PaymentMean,
} from "@/contracts/mobile";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import {
  deviceOwner,
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

   Libellés des sous-catégories déjà vues gardés à part
   (ht:<envId>:subCategoryLabels) : une saisie dont la
   sous-catégorie a été retirée ou clôturée garde son nom.

   Rechargés dès que l'environnement est établi, au retour au
   premier plan et sur demande (refresh). mobile.json seul,
   sans « Loading… » : toutes les minutes tant que l'app est
   à l'écran (release faite sur le Mac) et après un succès
   d'une saisie envoyée (expenseQueue.ts). Les données déjà
   affichées restent en place pendant un rechargement et
   après un échec : l'écran ne clignote pas.
========================= */

const MOBILE_CACHE = "mobile";

const CURRENCIES_CACHE = "currencies";

const LABELS_CACHE = "subCategoryLabels";

const PERIODIC_RELOAD_MS =
  60 * 1000;

export const mobileData =
  shallowRef<MobileData | null>(null);

export const currencies =
  ref<string[]>([BASE_CURRENCY]);

/*
  Cartes, sous-catégories et saisies du propriétaire de
  l'iPhone (contrat mobile, § 5) ; aucune sans propriétaire.
  Les montants du réel et du budget restent communs.
*/
export const ownPaymentMeans =
  computed<PaymentMean[]>(() =>
    (mobileData.value?.paymentMeans ?? [])
      .filter(mean => deviceOwner.value !== null && mean.owner === deviceOwner.value)
  );

export const ownSubCategories =
  computed<MobileSubCategory[]>(() =>
    (mobileData.value?.subCategories ?? [])
      .filter(sub => deviceOwner.value !== null && sub.owners.includes(deviceOwner.value))
  );

export const ownEntries =
  computed<MobileEntry[]>(() =>
    (mobileData.value?.entries ?? [])
      .filter(entry => deviceOwner.value !== null && entry.owner === deviceOwner.value)
  );

export const mobileLoading =
  ref(false);

/* mobile.json absent : pas encore publié par le Mac. */
export const mobileMissing =
  ref(false);

export const mobileError =
  ref("");

/* Libellés connus, par subCategoryId. */
const knownLabels =
  shallowRef<Record<string, string>>({});

function readLabels(
  raw: unknown
): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw)
      .filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1] !== "")
  );
}

function rememberLabels(
  data: MobileData
) {
  const labels =
    { ...knownLabels.value };

  let changed =
    false;

  for (const sub of data.subCategories) {
    if (sub.label && labels[sub.subCategoryId] !== sub.label) {
      labels[sub.subCategoryId] = sub.label;
      changed = true;
    }
  }

  if (changed) {
    knownLabels.value = labels;
    writeStored(LABELS_CACHE, labels);
  }
}

/* Libellé publié, sinon le dernier connu, sinon « Expense category <id> ». */
export function subCategoryLabel(
  id: number
): string {
  return (
    mobileData.value?.subCategories.find(sub => sub.subCategoryId === id)?.label ??
    knownLabels.value[id] ??
    `Expense category ${id}`
  );
}

/* Abonnés prévenus après chaque lecture réussie (file d'attente). */
const listeners =
  new Set<(data: MobileData) => void>();

export function onMobileData(
  listener: (data: MobileData) => void
) {
  listeners.add(listener);
}

function restoreCache() {
  knownLabels.value =
    readStored(LABELS_CACHE, readLabels) ?? {};

  const cached =
    readStored(MOBILE_CACHE, readMobileData);

  if (cached) {
    mobileData.value = cached;
    rememberLabels(cached);
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

let running = false;

/* background : mobile.json seul, sans « Loading… ». */
async function loadMobileData(
  background: boolean
) {
  if (running || !environmentEstablished()) {
    return;
  }

  running = true;
  mobileLoading.value = !background;

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
      rememberLabels(data);

      listeners.forEach(listener => listener(data));
    }

    mobileError.value = "";

    if (!background) {
      await refreshCurrencies();
    }

  } catch (err) {
    mobileError.value =
      err instanceof Error
        ? err.message
        : String(err);

  } finally {
    running = false;
    mobileLoading.value = false;
  }
}

export function refreshMobileData() {
  return loadMobileData(false);
}

/* Relecture discrète de mobile.json (file d'attente, relecture périodique). */
export function reloadMobileData() {
  return loadMobileData(true);
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

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void reloadMobileData();
    }
  }, PERIODIC_RELOAD_MS);
}
