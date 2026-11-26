import {
  ref,
  watch,
} from "vue";

import {
  APP_PARAMETERS_FILE,
  APP_PARAMETERS_FOLDER,
  readReferenceVersion,
  readWarningPercent,
} from "@/contracts/appParameters";

import {
  environment,
  environmentEstablished,
} from "@/services/environment/environmentState";

import { sending } from "@/services/mobile/expenseQueue";

import { setWarningPercent } from "@/services/settings/followUpSettings";

import { readDataJson } from "@/services/storage/dataStore";

import { log } from "@/utils/logger";

/* =========================
   Contrôle de version

   Mêmes règles que HomeTools : compare l'app à la version de
   référence (iHomeToolsVersion de settings/AppParameters.json,
   écrite au déploiement) :
   - dès que l'environnement est établi ;
   - au retour de l'app au premier plan ;
   - toutes les 30 minutes tant que la page est visible.
   Même lecture : marge d'alerte de Follow-up
   (followUpSettings.ts).
   Au plus un contrôle abouti toutes les 5 minutes ; une
   référence absente ou illisible, ou un proxy injoignable,
   ne bloque rien et est réessayé au déclencheur suivant.

   App trop ancienne : bandeau (App.vue) avec « Reload » et
   « Later » (plus de bandeau pour cette version pendant 30
   minutes). Le rechargement attend la fin d'un envoi en
   cours, puis ajoute la version à l'adresse (?v=…) pour
   contourner le cache de index.html (GitHub Pages, 10 min).
========================= */

const CHECK_INTERVAL_MS =
  5 * 60 * 1000;

const PERIODIC_CHECK_MS =
  30 * 60 * 1000;

const PROMPT_AGAIN_AFTER_MS =
  30 * 60 * 1000;

/* Version déployée plus récente que l'app ; null sinon ou après « Later ». */
export const availableVersion =
  ref<string | null>(null);

/* « Reload » touché : attente de la fin d'un envoi. */
export const reloading =
  ref(false);

let lastCheckAt = 0;

let running = false;

let declined: { version: string; at: number } | null = null;

/* -1 si a < b, 0 si égales, 1 si a > b (x.y.z). */
function compareVersions(
  a: string,
  b: string
): number {
  const pa =
    a.split(".").map(Number);

  const pb =
    b.split(".").map(Number);

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na =
      pa[i] ?? 0;

    const nb =
      pb[i] ?? 0;

    if (na !== nb) {
      return na > nb ? 1 : -1;
    }
  }

  return 0;
}

export async function checkAppVersion() {
  if (
    running ||
    !environmentEstablished() ||
    Date.now() - lastCheckAt < CHECK_INTERVAL_MS
  ) {
    return;
  }

  running = true;

  try {
    const raw =
      await readDataJson(`${APP_PARAMETERS_FOLDER}/${APP_PARAMETERS_FILE}`);

    if (raw !== null) {
      setWarningPercent(readWarningPercent(raw));
    }

    const reference =
      readReferenceVersion(raw);

    if (!reference) {
      log.warn("[Version] no reference version");
      return;
    }

    lastCheckAt = Date.now();

    const outdated =
      compareVersions(__APP_VERSION__, reference) < 0;

    const recentlyDeclined =
      declined !== null &&
      declined.version === reference &&
      Date.now() - declined.at < PROMPT_AGAIN_AFTER_MS;

    availableVersion.value =
      outdated && !recentlyDeclined
        ? reference
        : null;

  } catch (err) {
    log.warn("[Version] check skipped", err);

  } finally {
    running = false;
  }
}

/* « Later » : plus de bandeau pour cette version pendant 30 minutes. */
export function declineVersion() {
  if (availableVersion.value) {
    declined = {
      version: availableVersion.value,
      at: Date.now(),
    };
  }

  availableVersion.value = null;
}

/* « Reload » : après l'envoi en cours, s'il y en a un. */
export function reloadApp() {
  const version =
    availableVersion.value;

  if (!version || reloading.value) {
    return;
  }

  reloading.value = true;

  const reload = () => {
    const url =
      new URL(window.location.href);

    url.searchParams.set("v", version);

    window.location.replace(url.toString());
  };

  if (!sending.value) {
    reload();
    return;
  }

  const stop =
    watch(sending, value => {
      if (!value) {
        stop();
        reload();
      }
    });
}

/* Posé une fois au démarrage (main.ts). */
export function startVersionWatch() {
  watch(
    environment,

    (current, previous) => {
      if (current && !previous) {
        void checkAppVersion();
      }
    }
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkAppVersion();
    }
  });

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void checkAppVersion();
    }
  }, PERIODIC_CHECK_MS);
}
