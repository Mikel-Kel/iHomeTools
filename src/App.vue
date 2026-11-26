<script setup lang="ts">
import {
  computed,
  ref,
  type Component,
} from "vue";

import homeIcon from "@/assets/icons/home.png";

import AppUnavailable from "@/components/AppUnavailable.vue";
import AddView from "@/views/AddView.vue";
import BudgetView from "@/views/BudgetView.vue";
import HistoryView from "@/views/HistoryView.vue";

import { environmentChecking } from "@/services/environment/environmentGuard";

import {
  appUsable,
  environment,
  environmentBlock,
  hasCapability,
  storedEnvId,
} from "@/services/environment/environmentState";

import {
  queue,
  sendError,
} from "@/services/mobile/expenseQueue";

import {
  mobileError,
  mobileLoading,
  refreshMobileData,
} from "@/services/mobile/mobileData";

/* =========================
   Cadre de l'app

   En-tête (environnement, version, « Refresh »), bandeau
   d'état de la connexion et de la file, onglet courant,
   barre d'onglets en bas (Add, Budget, History).

   Les écrans s'ouvrent dès que l'environnement est connu,
   par whoami ou, hors ligne, par le coffre de la clé
   (appUsable) ; sinon « Connecting… » ou AppUnavailable.
========================= */

type Tab = "add" | "budget" | "history";

const tabs: { value: Tab; label: string; view: Component }[] = [
  { value: "add", label: "Add", view: AddView },
  { value: "budget", label: "Budget", view: BudgetView },
  { value: "history", label: "History", view: HistoryView },
];

const tab =
  ref<Tab>("add");

const currentView =
  computed(() => tabs.find(item => item.value === tab.value)!.view);

/* Capacité connue par whoami ; hors ligne, on s'en tient aux données gardées. */
const disabled =
  computed(() =>
    environment.value !== null &&
    !hasCapability("mobileExpense")
  );

const waiting =
  computed(() =>
    queue.value.filter(item => item.step !== "rejected").length
  );

const rejected =
  computed(() =>
    queue.value.filter(item => item.step === "rejected").length
  );

const banner =
  computed(() => {
    if (environmentBlock.value?.kind === "unreachable") {
      return {
        tone: "warning",
        text: waiting.value
          ? `Offline: ${waiting.value} ${waiting.value === 1 ? "entry" : "entries"} kept on this iPhone, sent later.`
          : "Offline: new entries are kept on this iPhone and sent later.",
      };
    }

    if (!environment.value) {
      return {
        tone: "neutral",
        text: environmentChecking.value ? "Connecting…" : "Not connected yet.",
      };
    }

    if (rejected.value) {
      return {
        tone: "error",
        text: `${rejected.value} ${rejected.value === 1 ? "entry" : "entries"} rejected: see History.`,
      };
    }

    if (sendError.value && waiting.value) {
      return {
        tone: "warning",
        text: `${waiting.value} ${waiting.value === 1 ? "entry" : "entries"} not sent yet: retried every minute.`,
      };
    }

    if (mobileError.value) {
      return {
        tone: "error",
        text: mobileError.value,
      };
    }

    return null;
  });

const envLabel =
  computed(() => environment.value?.label ?? storedEnvId.value ?? "");

const version =
  __APP_VERSION__;
</script>

<template>
  <template v-if="appUsable()">
    <header class="app-header">
      <img
        class="app-icon"
        :src="homeIcon"
        width="48"
        height="48"
        alt=""
        draggable="false"
      >

      <div class="title">
        <h1>iHomeTools</h1>

        <span class="subtitle">{{ envLabel }} · v{{ version }}</span>
      </div>

      <button
        v-if="environment && !disabled"
        type="button"
        class="button"
        :disabled="mobileLoading"
        @click="refreshMobileData"
      >
        {{ mobileLoading ? "Loading…" : "Refresh" }}
      </button>
    </header>

    <p
      v-if="banner"
      class="banner"
      :class="banner.tone"
      role="status"
    >
      {{ banner.text }}
    </p>

    <main class="content">
      <p
        v-if="disabled"
        class="state"
      >
        Mobile expenses are not enabled for this environment.
      </p>

      <component
        :is="currentView"
        v-else
      />
    </main>

    <nav
      class="tab-bar"
      aria-label="Sections"
    >
      <button
        v-for="item in tabs"
        :key="item.value"
        type="button"
        class="tab"
        :class="{ active: item.value === tab }"
        :aria-current="item.value === tab ? 'page' : undefined"
        @click="tab = item.value"
      >
        {{ item.label }}
      </button>
    </nav>
  </template>

  <p
    v-else-if="!environmentBlock"
    class="connecting"
  >
    Connecting…
  </p>

  <AppUnavailable />
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 10;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  padding: calc(var(--safe-top) + 10px) var(--gutter) 10px;

  border-bottom: 1px solid var(--border);

  background: var(--surface);
}

.app-icon {
  flex: none;

  user-select: none;
}

/* Titre à gauche, à côté de l'icône ; Refresh poussé à droite. */
.title {
  flex: 1;
  min-width: 0;
}

.title h1 {
  margin: 0;

  font-size: var(--font-size-xl);
}

.subtitle {
  color: var(--text-soft);
  font-size: var(--font-size-xs);
}

.banner {
  margin: 0;
  padding: 8px var(--gutter);

  font-size: var(--font-size-sm);
}

.banner.neutral {
  background: var(--surface-soft);
  color: var(--text-soft);
}

.banner.warning {
  background: var(--surface-soft);
  color: var(--warning);
}

.banner.error {
  background: var(--surface-soft);
  color: var(--negative);
}

/* Place de la barre d'onglets. */
.content {
  padding-bottom: calc(var(--safe-bottom) + 72px);
}

.state,
.connecting {
  margin: 0;
  padding: 2rem var(--gutter);

  color: var(--text-soft);
  text-align: center;
}

.connecting {
  padding-top: calc(var(--safe-top) + 2rem);
}

.tab-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;

  display: grid;
  grid-template-columns: repeat(3, 1fr);

  padding: 6px 8px calc(var(--safe-bottom) + 6px);

  border-top: 1px solid var(--border);

  background: var(--surface);
}

.tab {
  min-height: 48px;

  border: none;
  border-radius: 12px;

  background: transparent;
  color: var(--text-soft);

  font-weight: 600;

  cursor: pointer;
}

.tab.active {
  background: var(--primary-soft);
  color: var(--primary);
}
</style>
