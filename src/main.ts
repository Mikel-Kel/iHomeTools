import { createApp } from "vue";

import App from "./App.vue";
import "@/assets/theme.css";

import { startEnvironmentWatch } from "@/services/environment/environmentGuard";
import { log } from "@/utils/logger";

/* ============================
   Démarrage

   /api/whoami part en premier (environmentGuard.ts) ; les
   écrans attendent l'environnement (App.vue).
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

startEnvironmentWatch();
