<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from "vue";

import BudgetBar from "@/components/BudgetBar.vue";
import PeriodHeader from "@/components/PeriodHeader.vue";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import {
  mobileData,
  ownSubCategories,
  ownTrackedSubCategories,
  ownUntrackedSubCategories,
  ownUntrackedTotals,
} from "@/services/mobile/mobileData";

import { deviceOwner } from "@/services/environment/environmentState";

import { warningPercent } from "@/services/settings/followUpSettings";

import type { MobileSubCategory } from "@/contracts/mobile";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Réel face au budget

   Montants publiés par le Mac (mobile.json, contrat § 6), en
   CHF, communs à tout le ménage ; l'app n'additionne rien.
   Une ligne par sous-catégorie attribuée au propriétaire de
   l'iPhone (§ 5), dans l'ordre du Mac :
   réel / budget, non confirmé (« unconfirmed »), barre
   (BudgetBar.vue).

   Month : mois courant du Mac (today) ; flèches vers les 12
   derniers mois publiés (months, du plus ancien au courant).
   L'écran rouvre toujours sur le mois courant ; fichier sans
   months : mois courant seulement.
   Year to date : réel face au budget à date (janvier au mois
   courant compris) ; la barre va jusqu'au budget à date, le
   rouge commence au-delà.
   Year : réel face au budget de l'année ; la barre va
   jusqu'au budget de l'année, repère au budget à date.
   Chaque vue ne montre que son budget : rien n'est répété
   de l'une à l'autre.

   Écart au budget de la vue, par ligne : budget − consommé
   (réel + non confirmé), « N left » ou « N over ». Seul
   calcul de l'app, jamais de total. Vert sous (100 − p) %
   du budget, orange de (100 − p) % à 100 %, rouge au-delà ;
   p = followUp.warningPercent d'AppParameters.json (10 par
   défaut). Sans budget : rien.

   Personal (contrat v0.10) : sous-catégories hors suivi,
   dans la même carte, après les suivies, sous l'intertitre
   « Personal » : même présentation, sans budget ni barre,
   puis le total de untrackedTotals (calculé par le Mac). Mois
   montré pour Month, year.actual pour Year to date et Year
   (identiques : aucune saisie dans le futur).

   Période retenue sur l'iPhone (ht:<envId>:budget.period).
========================= */

type Period = "month" | "ytd" | "year";

const PERIODS: { value: Period; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "ytd", label: "Year to date" },
  { value: "year", label: "Year" },
];

const PERIOD_NAME = "budget.period";

const DISPLAY_LOCALE = "en-GB";

const period =
  ref<Period>(
    readStored(PERIOD_NAME, raw => PERIODS.find(item => item.value === raw)?.value ?? null) ?? "month"
  );

watch(
  period,

  value => {
    writeStored(PERIOD_NAME, value);
  }
);

/* Mois montré dans la vue Month (AAAA-MM) ; null : mois courant. */
const selectedMonth =
  ref<string | null>(null);

/* Mois publiés, du plus ancien au courant : la liste est la même pour toutes les sous-catégories. */
const monthKeys =
  computed(() => ownSubCategories.value[0]?.months.map(item => item.month) ?? []);

/* Position du mois montré ; mois inconnu (nouveau mois publié) : le courant. */
const monthIndex =
  computed(() => {
    const index =
      selectedMonth.value
        ? monthKeys.value.indexOf(selectedMonth.value)
        : -1;

    return index >= 0
      ? index
      : monthKeys.value.length - 1;
  });

const currentMonthShown =
  computed(() => monthIndex.value >= monthKeys.value.length - 1);

function moveMonth(
  step: number
) {
  const index =
    monthIndex.value + step;

  if (index < 0 || index >= monthKeys.value.length) {
    return;
  }

  selectedMonth.value =
    index === monthKeys.value.length - 1
      ? null
      : monthKeys.value[index];
}

/* Mois courant du Mac (AAAA-MM-JJ) ; null si illisible. */
const today =
  computed(() => {
    const match =
      /^(\d{4})-(\d{2})-\d{2}$/.exec(mobileData.value?.today ?? "");

    return match
      ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
      : null;
  });

/* Premier jour du mois montré dans la vue Month. */
const shownMonth =
  computed(() => {
    const match =
      currentMonthShown.value
        ? null
        : /^(\d{4})-(\d{2})$/.exec(monthKeys.value[monthIndex.value] ?? "");

    return match
      ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
      : today.value;
  });

const title =
  computed(() => {
    const date =
      period.value === "month"
        ? shownMonth.value
        : today.value;

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

    if (period.value === "month" || !date) {
      return "";
    }

    const month =
      date.toLocaleDateString(DISPLAY_LOCALE, { month: "long" });

    const toDate =
      date.getMonth() === 0
        ? "January"
        : `January to ${month}`;

    return period.value === "ytd"
      ? `Year to date: ${toDate}`
      : "Full year";
  });

interface BudgetRow {
  id: number;
  label: string;
  category: string;
  actual: number;
  pending: number;

  /* Budget comparé au réel, fin de la barre et début du rouge. */
  reference: number;
  budget: number;

  marker: number | null;
}

type DeltaTone = "positive" | "warning" | "negative";

interface Delta {
  text: string;
  tone: DeltaTone;
}

/* Écart au budget de la vue ; null sans budget. */
function delta(
  row: BudgetRow
): Delta | null {
  if (row.reference <= 0) {
    return null;
  }

  const consumed =
    row.actual + row.pending;

  const gap =
    row.reference - consumed;

  if (gap < 0) {
    return { text: `${formatAmount(-gap, 0)} over`, tone: "negative" };
  }

  return {
    text: `${formatAmount(gap, 0)} left`,
    tone: consumed >= row.reference * (1 - warningPercent.value / 100) ? "warning" : "positive",
  };
}

/* Montants du mois montré : month pour le mois courant, sinon l'élément de months (absent : zéro). */
function monthFigures(
  sub: MobileSubCategory
): Pick<BudgetRow, "actual" | "pending" | "reference" | "budget"> {
  const figures =
    currentMonthShown.value
      ? sub.month
      : sub.months.find(item => item.month === monthKeys.value[monthIndex.value]) ??
        { budget: 0, actual: 0, pending: 0 };

  return {
    actual: figures.actual,
    pending: figures.pending,
    reference: figures.budget,
    budget: figures.budget,
  };
}

const rows =
  computed<BudgetRow[]>(() =>
    ownTrackedSubCategories.value.map(sub =>
      period.value === "month"
        ? {
            id: sub.subCategoryId,
            label: sub.label,
            category: sub.categoryLabel,
            ...monthFigures(sub),
            marker: null,
          }
        : period.value === "ytd"
          ? {
              id: sub.subCategoryId,
              label: sub.label,
              category: sub.categoryLabel,
              actual: sub.year.actual,
              pending: sub.year.pending,
              reference: sub.year.budgetToDate,
              budget: sub.year.budgetToDate,
              marker: null,
            }
          : {
              id: sub.subCategoryId,
              label: sub.label,
              category: sub.categoryLabel,
              actual: sub.year.actual,
              pending: sub.year.pending,
              reference: sub.year.budget,
              budget: sub.year.budget,
              marker: sub.year.budgetToDate,
            }
    )
  );

/* Lignes affichées, avec leur écart au budget. */
const lines =
  computed(() => rows.value.map(row => ({ ...row, delta: delta(row) })));

interface PersonalRow {
  id: number;
  label: string;
  category: string;
  actual: number;
}

/* Réel hors suivi de la vue : mois montré, ou année (à date et entière, identiques). */
const personalRows =
  computed<PersonalRow[]>(() =>
    ownUntrackedSubCategories.value.map(sub => ({
      id: sub.subCategoryId,
      label: sub.label,
      category: sub.categoryLabel,
      actual:
        period.value === "month"
          ? monthFigures(sub).actual
          : sub.year.actual,
    }))
  );

/* Total publié par le Mac pour la vue ; null sans total. */
const personalTotal =
  computed<number | null>(() => {
    const totals =
      ownUntrackedTotals.value;

    if (!totals) {
      return null;
    }

    if (period.value !== "month") {
      return totals.year;
    }

    return currentMonthShown.value
      ? totals.month
      : totals.months.find(item => item.month === monthKeys.value[monthIndex.value])?.actual ?? 0;
  });

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
      v-else-if="!deviceOwner"
      class="state"
    >
      This iPhone has no owner: declare it in the proxy identities (environments.json).
    </p>

    <p
      v-else-if="!ownSubCategories.length"
      class="state"
    >
      No expense categories assigned to you yet: choose them in HomeTools › Master data.
    </p>

    <template v-else>
      <div
        class="periods"
        role="group"
        aria-label="Period"
      >
        <button
          v-for="item in PERIODS"
          :key="item.value"
          type="button"
          class="period"
          :class="{ selected: period === item.value }"
          :aria-pressed="period === item.value"
          @click="period = item.value"
        >
          {{ item.label }}
        </button>
      </div>

      <section class="card">
        <PeriodHeader
          :title="title"
          :subtitle="subtitle"
          :navigable="period === 'month'"
          :can-previous="monthIndex > 0"
          :can-next="!currentMonthShown"
          @move="moveMonth"
        />

        <ul class="rows">
          <li
            v-for="row in lines"
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
                  v-if="row.delta"
                  class="row-delta"
                  :class="row.delta.tone"
                >{{ row.delta.text }}</span>
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

          <!-- Personal : hors suivi, sans budget -->

          <li
            v-if="personalRows.length"
            class="group-title"
          >
            Personal
          </li>

          <li
            v-for="row in personalRows"
            :key="row.id"
            class="row"
            :class="{ empty: row.actual === 0 }"
          >
            <div class="row-main">
              <span class="row-label">
                {{ row.label }}
                <span class="row-meta">{{ row.category }}</span>
              </span>

              <span class="row-amounts">
                <span>
                  {{ formatAmount(row.actual, 0) }}
                  <span class="row-meta">· No budget</span>
                </span>
              </span>
            </div>
          </li>

          <li
            v-if="personalRows.length && personalTotal !== null"
            class="row total"
          >
            <div class="row-main">
              <span class="row-label">Total personal</span>

              <span class="row-amounts">
                {{ formatAmount(personalTotal, 0) }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <ul
        v-if="ownTrackedSubCategories.length"
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
  grid-template-columns: repeat(3, 1fr);
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

.row-delta {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.row-delta.positive {
  color: var(--positive);
}

.row-delta.warning {
  color: var(--warning);
}

.row-delta.negative {
  color: var(--negative);
}

.group-title {
  padding: 14px 0 4px;

  border-top: 1px solid var(--border);

  color: var(--text-soft);
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.group-title:first-child {
  padding-top: 4px;

  border-top: none;
}

.group-title + .row {
  border-top: none;
}

.row.empty {
  color: var(--text-soft);
}

.row.total {
  border-top-width: 2px;

  font-weight: 700;
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
