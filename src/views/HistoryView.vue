<script setup lang="ts">
import { computed } from "vue";

import StatusPill, { type StatusTone } from "@/components/StatusPill.vue";

import {
  discardExpense,
  queue,
  type QueueStep,
} from "@/services/mobile/expenseQueue";

import {
  mobileData,
  ownEntries,
} from "@/services/mobile/mobileData";

import type { MobileEntry } from "@/contracts/mobile";

import { deviceOwner } from "@/services/environment/environmentState";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Saisies récentes et leur état

   D'abord les saisies encore dans la file de l'iPhone
   (expenseQueue.ts), puis celles que publie mobile.json
   pour le propriétaire de l'iPhone (60 derniers jours et
   toutes les saisies ouvertes ; contrat mobile, § 5), de la
   plus récente à la plus ancienne. Une saisie présente des
   deux côtés est montrée une fois, avec l'état de la file.

   États : On iPhone, Sending, Sent (file) ; Received, Linked,
   Allocated, Cancelled (Mac) ; Rejected avec le message du
   Mac et « Discard ».
========================= */

interface HistoryRow {
  id: string;
  paidAt: string;
  amount: number;
  currency: string;
  cardId: number;
  subCategoryId: number;
  comment: string;
  state: string;
  tone: StatusTone;
  message: string;
  rejected: boolean;
  openTooLong: boolean;
}

const QUEUE_STATES: Record<QueueStep, { label: string; tone: StatusTone }> = {
  queued: { label: "On iPhone", tone: "warning" },
  written: { label: "Sending", tone: "warning" },
  sent: { label: "Sent", tone: "primary" },
  rejected: { label: "Rejected", tone: "negative" },
};

function entryState(
  entry: MobileEntry
): { label: string; tone: StatusTone } {
  if (entry.state === "cancelled") {
    return { label: "Cancelled", tone: "neutral" };
  }

  if (entry.allocated) {
    return { label: "Allocated", tone: "positive" };
  }

  return entry.state === "linked"
    ? { label: "Linked", tone: "positive" }
    : { label: "Received", tone: "primary" };
}

const cardLabels =
  computed(() =>
    new Map(
      (mobileData.value?.paymentMeans ?? []).map(mean => [mean.cardId, mean.label])
    )
  );

const subCategoryLabels =
  computed(() =>
    new Map(
      (mobileData.value?.subCategories ?? []).map(sub => [sub.subCategoryId, sub.label])
    )
  );

const rows =
  computed<HistoryRow[]>(() => {
    const queued =
      queue.value.map(item => ({
        id: item.expense.id,
        paidAt: item.expense.paidAt,
        amount: item.expense.amount,
        currency: item.expense.currency,
        cardId: item.expense.cardId,
        subCategoryId: item.expense.subCategoryId,
        comment: item.expense.comment,
        state: QUEUE_STATES[item.step].label,
        tone: QUEUE_STATES[item.step].tone,
        message: item.message,
        rejected: item.step === "rejected",
        openTooLong: false,
      }));

    const queuedIds =
      new Set(queued.map(row => row.id));

    const tooLong =
      new Set(
        (mobileData.value?.warnings ?? [])
          .filter(warning => warning.code === "OPEN_TOO_LONG")
          .map(warning => warning.id)
      );

    const published =
      ownEntries.value
        .filter(entry => !queuedIds.has(entry.id))
        .map(entry => {
          const state =
            entryState(entry);

          return {
            id: entry.id,
            paidAt: entry.paidAt,
            amount: entry.amount,
            currency: entry.currency,
            cardId: entry.cardId,
            subCategoryId: entry.subCategoryId,
            comment: entry.comment,
            state: state.label,
            tone: state.tone,
            message: entry.movement?.text ?? "",
            rejected: false,
            openTooLong: tooLong.has(entry.id),
          };
        });

    return [...queued, ...published]
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  });

/* AAAA-MM-JJTHH:MM:SS → JJ.MM HH:MM */
function shortDateTime(
  value: string
): string {
  const match =
    /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);

  return match
    ? `${match[2]}.${match[1]} ${match[3]}:${match[4]}`
    : value;
}
</script>

<template>
  <div class="history-view">
    <p
      v-if="!deviceOwner"
      class="state"
    >
      This iPhone has no owner: only entries still on this iPhone are shown.
    </p>

    <p
      v-else-if="!rows.length"
      class="state"
    >
      No entry yet.
    </p>

    <ul
      v-if="rows.length"
      class="rows"
    >
      <li
        v-for="row in rows"
        :key="row.id"
        class="row"
      >
        <div class="row-main">
          <span class="row-title">
            {{ subCategoryLabels.get(row.subCategoryId) ?? `Sub-category ${row.subCategoryId}` }}
          </span>

          <span class="row-amount">
            {{ formatAmount(row.amount) }} {{ row.currency }}
          </span>
        </div>

        <div class="row-meta">
          <span>
            {{ shortDateTime(row.paidAt) }} · {{ cardLabels.get(row.cardId) ?? `Card ${row.cardId}` }}
            <template v-if="row.comment"> · {{ row.comment }}</template>
          </span>

          <span class="pills">
            <StatusPill
              v-if="row.openTooLong"
              tone="warning"
            >
              Not linked yet
            </StatusPill>

            <StatusPill :tone="row.tone">
              {{ row.state }}
            </StatusPill>
          </span>
        </div>

        <p
          v-if="row.message"
          class="row-message"
          :class="{ error: row.rejected }"
        >
          {{ row.message }}
        </p>

        <button
          v-if="row.rejected"
          type="button"
          class="button discard"
          @click="discardExpense(row.id)"
        >
          Discard
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.history-view {
  padding: var(--gutter);
}

.state {
  margin: 1rem 0 0;

  color: var(--text-soft);
  text-align: center;
}

.rows {
  margin: 0;
  padding: 0;

  border: 1px solid var(--border);
  border-radius: 14px;

  background: var(--surface);

  list-style: none;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 4px;

  padding: 10px 14px;

  border-top: 1px solid var(--border);
}

.row:first-child {
  border-top: none;
}

.row-main,
.row-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.row-title {
  font-weight: 600;
}

.row-amount {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.row-meta {
  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.pills {
  display: inline-flex;
  gap: 4px;
}

.row-message {
  margin: 0;

  color: var(--text-soft);
  font-size: var(--font-size-sm);
}

.row-message.error {
  color: var(--negative);
}

.discard {
  align-self: flex-start;
  min-height: 36px;
}
</style>
