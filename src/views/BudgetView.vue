<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from "vue";

import BudgetBar from "@/components/BudgetBar.vue";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import { mobileData } from "@/services/mobile/mobileData";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Réel face au budget

   Montants publiés par le Mac (mobile.json, contrat § 6), en
   CHF, commun à tous les iPhones ; l'app n'additionne rien.
   Une ligne par sous-catégorie mobile, dans l'ordre du Mac :
   réel / budget, non confirmé (« unconfirmed »), barre
   (BudgetBar.vue).

   Month : mois courant du Mac (today).
   Year : réel face au budget à date (janvier au mois courant
   compris, repère de la barre), budget de l'année en petit ;
   la barre va jusqu'au budget de l'année.

   Période retenue sur l'iPhone (ht:<envId>:budget.period).
========================= */

type Period = "month" | "year";

const PERIOD_NAME = "budget.period";

const DISPLAY_LOCALE = "en-GB";

const period =
  ref<Period>(
    readStored(PERIOD_NAME, raw => (raw === "year" ? "year" : raw === "month" ? "month" : null)) ?? "month"
  );

watch(
  period,

  value => {
    writeStored(PERIOD_NAME, value);
  }
);

const subCategories =
  computed(() => mobileData.value?.subCategories ?? []);

/* Mois courant du Mac (AAAA-MM-JJ) ; null si illisible. */
const today =
  computed(() => {
    const match =
      /^(\d{4})-(\d{2})-\d{2}$/.exec(mobileData.value?.today ?? "");

    return match
      ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
      : null;
  });

const title =
  computed(() => {
    const date =
      today.value;

    if (!date) {
      return period.value === "month" ? "This month" : "This year";
    }

    return period.value === "month"
      ? date.toLocaleDateString(DISPLAY_LOCALE, { month: "long", year: "numeric" })
      : String(date.getFullYear());
  });

const subtitle =
  computed(() => {
    const date =
      today.value;

    if (period.value !== "year" || !date) {
      return "";
    }

    const month =
      date.toLocaleDateString(DISPLAY_LOCALE, { month: "long" });

    return date.getMonth() === 0
      ? "Budget to date: January"
      : `Budget to date: January to ${month}`;
  });

interface BudgetRow {
  id: number;
  label: string;
  category: string;
  actual: number;
  pending: number;

  /* Budget comparé au réel : du mois, ou à date pour l'année. */
  reference: number;

  /* Fin de la barre : budget du mois ou de l'année. */
  budget: number;

  marker: number | null;

  /* Budget de l'année, affiché en petit (vue année). */
  yearBudget: number | null;
}

const rows =
  computed<BudgetRow[]>(() =>
    subCategories.value.map(sub =>
      period.value === "month"
        ? {
            id: sub.subCategoryId,
            label: sub.label,
            category: sub.categoryLabel,
            actual: sub.month.actual,
            pending: sub.month.pending,
            reference: sub.month.budget,
            budget: sub.month.budget,
            marker: null,
            yearBudget: null,
          }
        : {
            id: sub.subCategoryId,
            label: sub.label,
            category: sub.categoryLabel,
            actual: sub.year.actual,
            pending: sub.year.pending,
            reference: sub.year.budgetToDate,
            budget: sub.year.budget,
            marker: sub.year.budgetToDate,
            yearBudget: sub.year.budget,
          }
    )
  );

/* Publication du Mac (UTC) → JJ.MM.AAAA HH:MM, heure de l'iPhone. */
const generatedAt =
  computed(() => {
    const time =
      Date.parse(mobileData.value?.generatedAt ?? "");

    if (Number.isNaN(time)) {
      return "";
    }

    const date =
      new Date(time);

    const pad =
      (value: number) => String(value).padStart(2, "0");

    return (
      `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  });
</script>

<template>
  <div class="budget-view">
    <p
      v-if="!mobileData"
      class="state"
    >
      No mobile data on this iPhone yet: connect once to the home services.
    </p>

    <p
      v-else-if="!subCategories.length"
      class="state"
    >
      No sub-category offered yet: choose them in HomeTools, Master data.
    </p>

    <template v-else>
      <div
        class="periods"
        role="group"
        aria-label="Period"
      >
        <button
          type="button"
          class="period"
          :class="{ selected: period === 'month' }"
          :aria-pressed="period === 'month'"
          @click="period = 'month'"
        >
          Month
        </button>

        <button
          type="button"
          class="period"
          :class="{ selected: period === 'year' }"
          :aria-pressed="period === 'year'"
          @click="period = 'year'"
        >
          Year
        </button>
      </div>

      <section class="card">
        <header class="card-header">
          <h2>{{ title }}</h2>

          <p
            v-if="subtitle"
            class="subtitle"
          >
            {{ subtitle }}
          </p>
        </header>

        <ul class="rows">
          <li
            v-for="row in rows"
            :key="row.id"
            class="row"
          >
            <div class="row-main">
              <span class="row-label">
                {{ row.label }}
                <span class="row-meta">{{ row.category }}</span>
              </span>

              <span class="row-amounts">
                <span>
                  {{ formatAmount(row.actual, 0) }}
                  <span class="row-meta">{{ row.reference > 0 ? `/ ${formatAmount(row.reference, 0)}` : "· No budget" }}</span>
                </span>

                <span
                  v-if="row.yearBudget !== null && row.yearBudget > 0"
                  class="row-meta"
                >Year {{ formatAmount(row.yearBudget, 0) }}</span>
              </span>
            </div>

            <BudgetBar
              :actual="row.actual"
              :pending="row.pending"
              :budget="row.budget"
              :marker="row.marker"
            />

            <span
              v-if="row.pending > 0"
              class="row-pending"
            >
              + {{ formatAmount(row.pending, 0) }} unconfirmed
            </span>
          </li>
        </ul>
      </section>

      <ul
        class="legend"
        aria-label="Legend"
      >
        <li>
          <span class="swatch actual" />
          Actual
        </li>

        <li>
          <span class="swatch pending" />
          Unconfirmed
        </li>

        <li>
          <span class="swatch over" />
          Over budget
        </li>

        <li v-if="period === 'year'">
          <span class="swatch marker" />
          Budget to date
        </li>
      </ul>

      <p
        v-if="generatedAt"
        class="generated"
      >
        Figures of {{ generatedAt }}, in CHF.
      </p>
    </template>
  </div>
</template>

<style scoped>
.budget-view {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;

  padding: var(--gutter);
}

.state {
  margin: 1rem 0 0;

  color: var(--text-soft);
  text-align: center;
}

.periods {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;

  padding: 4px;

  border-radius: 14px;

  background: var(--btn-secondary-bg);
}

.period {
  min-height: 40px;

  border: none;
  border-radius: 10px;

  background: none;
  color: var(--text-soft);

  font-weight: 600;

  cursor: pointer;
}

.period.selected {
  background: var(--surface);
  color: var(--text);

  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.card {
  padding: 12px 14px;

  border: 1px solid var(--border);
  border-radius: 14px;

  background: var(--surface);
}

.card-header {
  margin: 0 0 4px;
}

.card-header h2 {
  margin: 0;

  font-size: var(--font-size-lg);
}

.subtitle {
  margin: 2px 0 0;

  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.rows {
  margin: 0;
  padding: 0;

  list-style: none;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;

  padding: 10px 0;

  border-top: 1px solid var(--border);
}

.row:first-child {
  border-top: none;
}

.row-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.row-label {
  display: flex;
  flex-direction: column;

  min-width: 0;

  font-weight: 600;
  overflow-wrap: anywhere;
}

.row-meta {
  color: var(--text-soft);
  font-size: var(--font-size-sm);
  font-weight: 400;
}

.row-amounts {
  display: flex;
  flex-direction: column;
  align-items: flex-end;

  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.row-pending {
  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;

  margin: 0;
  padding: 0 2px;

  color: var(--text-soft);
  font-size: var(--font-size-sm);

  list-style: none;
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  display: inline-block;

  width: 18px;
  height: 10px;

  border-radius: 3px;
}

.swatch.actual {
  background: var(--primary);
}

.swatch.pending {
  background:
    repeating-linear-gradient(
      -45deg,
      var(--primary) 0 3px,
      transparent 3px 6px
    );

  box-shadow: inset 0 0 0 1px var(--primary);
}

.swatch.over {
  background: var(--negative);
}

.swatch.marker {
  width: 2px;
  height: 14px;

  border-radius: 0;

  background: var(--text);
}

.generated {
  margin: 0;

  color: var(--text-muted);
  font-size: var(--font-size-xs);
  text-align: center;
}
</style>
