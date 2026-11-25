<script setup lang="ts">
import { computed } from "vue";

import { useMobileData } from "@/composables/useMobileData";

import {
  environment,
  hasCapability,
} from "@/services/environment/environmentState";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Accueil (squelette)

   Vérifie la chaîne complète : environnement, capacité
   mobileExpense, lecture de mobile/mobile.json. Montre les
   cartes et les sous-catégories proposées, avec le réel et
   le budget du mois en chiffres ; la saisie et les barres
   viendront ensuite.
========================= */

const enabled =
  hasCapability("mobileExpense");

const mobile =
  useMobileData();

const data =
  computed(() => mobile.data.value);

const isEmpty =
  computed(() =>
    !!data.value &&
    !data.value.paymentMeans.length &&
    !data.value.subCategories.length
  );

const generatedLabel =
  computed(() => {
    const value =
      data.value?.generatedAt;

    const date =
      value ? new Date(value) : null;

    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "";
  });

const version =
  __APP_VERSION__;
</script>

<template>
  <header class="app-header">
    <div>
      <h1>iHomeTools</h1>

      <span class="env-label">{{ environment?.label }}</span>
    </div>

    <button
      v-if="enabled"
      type="button"
      class="button"
      :disabled="mobile.loading.value"
      @click="mobile.refresh"
    >
      {{ mobile.loading.value ? "Loading…" : "Refresh" }}
    </button>
  </header>

  <main class="home">
    <p
      v-if="!enabled"
      class="state"
    >
      Mobile expenses are not enabled for this environment.
    </p>

    <template v-else>
      <p
        v-if="mobile.error.value"
        class="state error"
      >
        {{ mobile.error.value }}
      </p>

      <p
        v-if="mobile.missing.value"
        class="state"
      >
        The Mac has not published the mobile data yet.
      </p>

      <p
        v-else-if="!data && mobile.loading.value"
        class="state"
      >
        Loading…
      </p>

      <p
        v-else-if="isEmpty"
        class="state"
      >
        No card or sub-category offered yet: choose them in HomeTools, Master data.
      </p>

      <template v-else-if="data">
        <section class="card">
          <h2>Cards</h2>

          <p
            v-if="!data.paymentMeans.length"
            class="empty"
          >
            No card offered.
          </p>

          <ul
            v-else
            class="rows"
          >
            <li
              v-for="mean in data.paymentMeans"
              :key="mean.cardId"
            >
              <span class="row-label">{{ mean.label }}</span>
              <span class="row-meta">{{ mean.holder }} · {{ mean.kind }} · {{ mean.currency }}</span>
            </li>
          </ul>
        </section>

        <section class="card">
          <h2>This month</h2>

          <p
            v-if="!data.subCategories.length"
            class="empty"
          >
            No sub-category offered.
          </p>

          <ul
            v-else
            class="rows"
          >
            <li
              v-for="sub in data.subCategories"
              :key="sub.subCategoryId"
            >
              <span class="row-label">
                {{ sub.label }}
                <span class="row-meta">{{ sub.categoryLabel }}</span>
              </span>

              <span class="row-amounts">
                {{ formatAmount(sub.month.actual, 0) }}
                <span class="row-meta">/ {{ formatAmount(sub.month.budget, 0) }}</span>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </main>

  <footer class="app-footer">
    <span v-if="generatedLabel">Published {{ generatedLabel }}</span>
    <span>v{{ version }}</span>
  </footer>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 10;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  padding: calc(var(--safe-top) + 10px) var(--gutter) 10px;

  border-bottom: 1px solid var(--border);

  background: var(--surface);
}

.app-header h1 {
  margin: 0;

  font-size: var(--font-size-xl);
}

.env-label {
  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.home {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  padding: var(--gutter);
}

.state {
  margin: 1rem 0 0;

  color: var(--text-soft);
  text-align: center;
}

.state.error {
  color: var(--negative);
}

.card {
  padding: 12px 14px;

  border: 1px solid var(--border);
  border-radius: 14px;

  background: var(--surface);
}

.card h2 {
  margin: 0 0 6px;

  font-size: var(--font-size-lg);
}

.empty {
  margin: 0;

  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.rows {
  margin: 0;
  padding: 0;

  list-style: none;
}

.rows li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;

  min-height: 44px;
  padding: 8px 0;

  border-top: 1px solid var(--border);
}

.rows li:first-child {
  border-top: none;
}

.row-label {
  display: flex;
  flex-direction: column;

  font-weight: 600;
}

.row-meta {
  color: var(--text-soft);
  font-size: var(--font-size-sm);
  font-weight: 400;
}

.row-amounts {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.app-footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;

  padding: 8px var(--gutter) calc(var(--safe-bottom) + 12px);

  color: var(--text-muted);
  font-size: var(--font-size-xs);
}
</style>
