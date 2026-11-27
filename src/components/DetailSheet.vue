<script setup lang="ts">
import {
  computed,
  onMounted,
  watch,
} from "vue";

import type { DetailLine } from "@/contracts/details";

import { mobileData } from "@/services/mobile/mobileData";

import {
  detailsError,
  detailsLoading,
  detailsMissing,
  loadMobileDetails,
  mobileDetails,
} from "@/services/mobile/mobileDetails";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Détail d'une sous-catégorie (Follow-up)

   Panneau du bas de l'écran, ouvert par un toucher sur une
   ligne de BudgetView.vue : lignes de mobile/details.json
   (contrat § 5.1) de la sous-catégorie dont le mois est dans
   la période montrée (mois montré, ou mois de l'année
   civile en cours), dans l'ordre du Mac (plus récentes
   d'abord). Aucun total : le montant de la ligne de
   Follow-up en est la somme.

   Texte : commentaire, sinon texte de la banque ; commerçant
   en dessous s'il est différent. Non confirmé : marque
   « Unconfirmed ».
   Relu à l'ouverture et quand mobile.json change pendant que
   le panneau est ouvert (mobileDetails.ts).
========================= */

const props =
  defineProps<{
    subCategoryId: number;
    label: string;
    category: string;

    /* Période montrée, déjà mise en forme (« November 2026 », « Year to date 2026 »). */
    period: string;

    /* Mois de la période (AAAA-MM). */
    months: string[];
  }>();

const emit =
  defineEmits<{
    close: [];
  }>();

const lines =
  computed<DetailLine[]>(() =>
    (mobileDetails.value?.lines ?? [])
      .filter(line => line.subCategoryId === props.subCategoryId && props.months.includes(line.month))
  );

/* Copie plus ancienne que les montants affichés (lecture échouée, hors ligne). */
const stale =
  computed(() =>
    mobileDetails.value !== null &&
    mobileDetails.value.generatedAt !== mobileData.value?.generatedAt &&
    !detailsLoading.value
  );

/* AAAA-MM-JJ → JJ.MM.AAAA */
function displayDate(
  value: string
): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  return match
    ? `${match[3]}.${match[2]}.${match[1]}`
    : value;
}

function mainText(
  line: DetailLine
): string {
  return line.comment ?? line.bankText ?? line.partyLabel ?? "No text";
}

function merchantText(
  line: DetailLine
): string {
  return line.partyLabel && line.partyLabel !== mainText(line)
    ? line.partyLabel
    : "";
}

onMounted(() => {
  void loadMobileDetails();
});

watch(
  () => mobileData.value?.generatedAt,

  () => {
    void loadMobileDetails();
  }
);
</script>

<template>
  <Teleport to="body">
    <div
      class="backdrop"
      @click.self="emit('close')"
    >
      <section
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-sheet-title"
      >
        <header class="sheet-header">
          <div class="heading">
            <h2 id="detail-sheet-title">
              {{ label }}
            </h2>

            <p class="subtitle">
              {{ category }} · {{ period }}
            </p>
          </div>

          <button
            type="button"
            class="button"
            @click="emit('close')"
          >
            Close
          </button>
        </header>

        <p
          v-if="detailsError"
          class="note"
        >
          Details not read: {{ detailsError }}
        </p>

        <p
          v-else-if="stale"
          class="note"
        >
          These details may be older than the figures shown.
        </p>

        <p
          v-if="!mobileDetails && detailsLoading"
          class="state"
        >
          Loading…
        </p>

        <p
          v-else-if="!mobileDetails && detailsMissing"
          class="state"
        >
          No details published by the Mac yet.
        </p>

        <p
          v-else-if="!mobileDetails"
          class="state"
        >
          No details on this iPhone yet: connect to the home services.
        </p>

        <p
          v-else-if="!lines.length"
          class="state"
        >
          Nothing for this period.
        </p>

        <ul
          v-else-if="lines.length"
          class="lines"
        >
          <li
            v-for="(line, index) in lines"
            :key="line.expenseId ?? `${line.date}-${index}`"
            class="line"
          >
            <div class="line-main">
              <span class="line-text">
                {{ mainText(line) }}

                <span
                  v-if="merchantText(line)"
                  class="line-meta"
                >{{ merchantText(line) }}</span>
              </span>

              <span class="line-amount">
                {{ formatAmount(line.amount) }}
              </span>
            </div>

            <div class="line-sub">
              <span class="line-meta">{{ displayDate(line.date) }}</span>

              <span
                v-if="line.kind === 'pending'"
                class="unconfirmed"
              >
                Unconfirmed
              </span>
            </div>
          </li>
        </ul>

        <p class="footnote">
          In CHF, most recent first.
        </p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;

  display: flex;
  align-items: flex-end;

  background: rgba(0, 0, 0, 0.4);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;

  width: 100%;
  max-height: calc(100% - var(--safe-top) - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;

  padding: var(--gutter) var(--gutter) calc(var(--gutter) + var(--safe-bottom));

  border-radius: 18px 18px 0 0;

  background: var(--bg);
  box-shadow: var(--shadow-lg);
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.heading {
  min-width: 0;
}

.sheet-header h2 {
  margin: 0;

  font-size: var(--font-size-lg);
  overflow-wrap: anywhere;
}

.subtitle {
  margin: 2px 0 0;

  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.note {
  margin: 0;
  padding: 10px 12px;

  border: 1px solid var(--border);
  border-radius: 12px;

  background: var(--surface);
  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.state {
  margin: 0.5rem 0;

  color: var(--text-soft);
  text-align: center;
}

.lines {
  margin: 0;
  padding: 4px 14px;

  border: 1px solid var(--border);
  border-radius: 14px;

  background: var(--surface);

  list-style: none;
}

.line {
  display: flex;
  flex-direction: column;
  gap: 2px;

  padding: 10px 0;

  border-top: 1px solid var(--border);
}

.line:first-child {
  border-top: none;
}

.line-main,
.line-sub {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.line-text {
  display: flex;
  flex-direction: column;

  min-width: 0;

  overflow-wrap: anywhere;
}

.line-meta {
  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.line-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}

.unconfirmed {
  color: var(--warning);
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.footnote {
  margin: 0;

  color: var(--text-muted);
  font-size: var(--font-size-xs);
  text-align: center;
}
</style>
