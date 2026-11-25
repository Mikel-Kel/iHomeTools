import {
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from "vue";

import {
  MOBILE_FILE,
  MOBILE_FOLDER,
  readMobileData,
  type MobileData,
} from "@/contracts/mobile";

import { readDataJson } from "@/services/storage/dataStore";

/* =========================
   Données de mobile/mobile.json

   Chargées au montage, au retour au premier plan et sur
   demande (refresh). Les données déjà affichées restent en
   place pendant un rechargement et après un échec : l'écran
   ne clignote pas, l'erreur s'affiche à côté.

   Fichier absent : missing (pas encore publié par le Mac).
========================= */

export function useMobileData() {
  const data =
    shallowRef<MobileData | null>(null);

  const loading =
    ref(false);

  const missing =
    ref(false);

  const error =
    ref("");

  async function refresh() {
    if (loading.value) {
      return;
    }

    loading.value = true;

    try {
      const raw =
        await readDataJson(`${MOBILE_FOLDER}/${MOBILE_FILE}`);

      missing.value =
        raw === null;

      data.value =
        raw === null
          ? null
          : readMobileData(raw);

      error.value = "";

    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : String(err);

    } finally {
      loading.value = false;
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      void refresh();
    }
  }

  onMounted(() => {
    void refresh();
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  return {
    data,
    loading,
    missing,
    error,
    refresh,
  };
}
