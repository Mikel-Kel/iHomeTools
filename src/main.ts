import { createApp } from "vue";

import App from "./App.vue";
import "@/assets/theme.css";

import { startAppStatusWatch } from "@/services/appStatus/appStatusGuard";
import { startEnvironmentWatch } from "@/services/environment/environmentGuard";
import { startExpenseQueue } from "@/services/mobile/expenseQueue";
import { startMobileDataWatch } from "@/services/mobile/mobileData";
import { startVersionWatch } from "@/services/version/versionGuard";
import { log } from "@/utils/logger";

/* ============================
   Démarrage

   /api/whoami part en premier (environmentGuard.ts) ; les
   écrans attendent l'environnement, ou celui du coffre hors
   ligne (App.vue). Données mobiles, file d'attente,
   maintenance et contrôle de version partent dès qu'il est
   connu.
============================ */

const app =
  createApp(App);

app.config.errorHandler = (err, _instance, info) => {
  log.error("[Vue errorHandler]", err, info);
};

window.addEventListener("unhandledrejection", (e) => {
  log.error("[unhandledrejection]", e.reason);
});

app.mount("#app");

startMobileDataWatch();
startExpenseQueue();
startAppStatusWatch();
startVersionWatch();
startEnvironmentWatch();
