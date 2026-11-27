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
  type UntrackedTotals,
} from "@/contracts/mobile";

import {
  PARTIES_FILE,
  PARTIES_FOLDER,
  partiesCache,
  readParties,
  type Party,
} from "@/contracts/parties";

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

   mobile/mobile.json, les devises de
   settings/exchangeRates.json et les parties de
   settings/parties.json (commerçant), partagés par tous les
   onglets. Copie gardée sur l'iPhone (ht:<envId>:mobile,
   ht:<envId>:currencies, ht:<envId>:parties, réduite aux
   champs utiles) : l'app s'ouvre hors ligne avec les
   dernières données reçues.

   Libellés des sous-catégories déjà vues gardés à part
   (ht:<envId>:subCategoryLabels) : une saisie dont la
   sous-catégorie a été retirée ou clôturée garde son nom.

   Rechargés dès que l'environnement est établi, au retour au
   premier plan et sur demande (refresh). Parties (fichier
   lourd) : seulement à la connexion, sur « Refresh » et
   après un refus du Mac. mobile.json seul,
   sans « Loading… » : toutes les minutes tant que l'app est
   à l'écran (release faite sur le Mac) et après un succès
   d'une saisie envoyée (expenseQueue.ts). Les données déjà
   affichées restent en place pendant un rechargement et
   après un échec : l'écran ne clignote pas.
========================= */

const MOBILE_CACHE = "mobile";

const CURRENCIES_CACHE = "currencies";

const LABELS_CACHE = "subCategoryLabels";

const PARTIES_CACHE = "parties";

const PERIODIC_RELOAD_MS =
  60 * 1000;

export const mobileData =
  shallowRef<MobileData | null>(null);

export const currencies =
  ref<string[]>([BASE_CURRENCY]);

/* Parties proposées comme commerçant, les plus utilisées d'abord. */
export const parties =
  shallowRef<Party[]>([]);

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

/* Sous-catégories suivies (Follow-up, budget) et hors suivi (Personal), contrat v0.10. */
export const ownTrackedSubCategories =
  computed(() => ownSubCategories.value.filter(sub => sub.tracked));

export const ownUntrackedSubCategories =
  computed(() => ownSubCategories.value.filter(sub => !sub.tracked));

/* Totaux hors suivi du propriétaire de l'iPhone, calculés par le Mac ; null sans total. */
export const ownUntrackedTotals =
  computed<UntrackedTotals | null>(() =>
    (mobileData.value?.untrackedTotals ?? [])
      .find(total => deviceOwner.value !== null && total.owner === deviceOwner.value) ?? null
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

/* Libellé de la partie, sinon celui publié avec une saisie, sinon « Merchant <id> ». */
export function partyLabel(
  id: number
): string {
  return (
    parties.value.find(party => party.id === id)?.label ??
    mobileData.value?.entries.find(entry => entry.partyId === id && entry.partyLabel)?.partyLabel ??
    `Merchant ${id}`
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

  parties.value =
    readStored(PARTIES_CACHE, readParties) ?? [];
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

/* Fichier des parties absent : texte libre seulement ; illisible ou proxy injoignable : liste précédente. */
async function refreshParties() {
  try {
    const raw =
      await readDataJson(`${PARTIES_FOLDER}/${PARTIES_FILE}`);

    parties.value =
      raw === null
        ? []
        : readParties(raw);

    writeStored(PARTIES_CACHE, partiesCache(parties.value));
  } catch (err) {
    log.warn("[Mobile] parties not read", err);
  }
}

/*
  full : mobile.json, devises et parties, avec « Loading… »
    (connexion, « Refresh », refus du Mac) ;
  foreground : sans les parties (retour au premier plan) ;
  background : mobile.json seul, sans « Loading… ».
*/
type LoadMode =
  | "full"
  | "foreground"
  | "background";

let running = false;

async function loadMobileData(
  mode: LoadMode
) {
  if (running || !environmentEstablished()) {
    return;
  }

  running = true;
  mobileLoading.value = mode !== "background";

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

    if (mode !== "background") {
      await refreshCurrencies();
    }

    if (mode === "full") {
      await refreshParties();
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
  return loadMobileData("full");
}

/* Relecture discrète de mobile.json (file d'attente, relecture périodique). */
export function reloadMobileData() {
  return loadMobileData("background");
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
      void loadMobileData("foreground");
    }
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void reloadMobileData();
    }
  }, PERIODIC_RELOAD_MS);
}
