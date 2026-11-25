<script setup lang="ts">
import { computed } from "vue";

import { mobileData } from "@/services/mobile/mobileData";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Réel face au budget

   Montants publiés par le Mac (mobile.json, contrat § 6),
   en CHF, sans aucun calcul ; pour l'instant le mois courant
   en chiffres, les barres (mois et année, part « non
   confirmé ») viendront à l'étape suivante.
========================= */

const subCategories =
  computed(() => mobileData.value?.subCategories ?? []);
</script>

<template>
  <div class="budget-view">
    <p
      v-if="!subCategories.length"
      class="state"
    >
      No sub-category offered yet: choose them in HomeTools, Master data.
    </p>

    <section
      v-else
      class="card"
    >
      <h2>This month</h2>

      <ul class="rows">
        <li
          v-for="sub in subCategories"
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
  </div>
</template>

<style scoped>
.budget-view {
  padding: var(--gutter);
}

.state {
  margin: 1rem 0 0;

  color: var(--text-soft);
  text-align: center;
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
</style>
