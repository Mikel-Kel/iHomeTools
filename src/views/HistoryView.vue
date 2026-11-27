<script setup lang="ts">
import {
  computed,
  ref,
} from "vue";

import ExpenseSheet from "@/components/ExpenseSheet.vue";
import type { FormScope } from "@/components/ExpenseForm.vue";
import StatusPill, { type StatusTone } from "@/components/StatusPill.vue";

import {
  discardExpense,
  queue,
  type QueuedExpense,
} from "@/services/mobile/expenseQueue";

import {
  mobileData,
  ownEntries,
  partyLabel,
  subCategoryLabel,
} from "@/services/mobile/mobileData";

import type {
  MobileEntry,
  MobileExpenseSave,
} from "@/contracts/mobile";

import { deviceOwner } from "@/services/environment/environmentState";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Saisies récentes et leur état

   D'abord les saisies encore dans la file de l'iPhone
   (expenseQueue.ts), puis celles que publie mobile.json
   pour le propriétaire de l'iPhone (60 derniers jours et
   toutes les saisies ouvertes ; contrat mobile, § 5), de la
   plus récente à la plus ancienne. Une saisie présente des
   deux côtés est montrée une fois, avec l'état de la file et
   sa dernière version voulue.

   États : On iPhone, Sending, Sent, Cancelling (file) ;
   Received, Linked, Allocated, Cancelled (Mac) ; Rejected
   avec le message du Mac et « Discard ».

   Toucher une saisie ouvre ExpenseSheet.vue. Règles (§ 4.1,
   § 4.2) : saisie ouverte ou refusée, tout modifiable et
   annulable ; liée, sous-catégorie, commerçant et commentaire seulement,
   annulable (le Mac défait la liaison, contrat § 4.2) ; allouée, annulée, en cours d'envoi ou
   d'annulation : lecture seule.
========================= */

interface EditRules {
  scope: FormScope;
  cancellable: boolean;
  note: string;
}

interface HistoryRow extends EditRules {
  expense: MobileExpenseSave;
  state: string;
  tone: StatusTone;
  message: string;
  rejected: boolean;
  openTooLong: boolean;
}

function queueState(
  item: QueuedExpense
): { label: string; tone: StatusTone } {
  if (item.step === "rejected") {
    return { label: "Rejected", tone: "negative" };
  }

  if (item.action === "cancel") {
    return { label: "Cancelling", tone: "warning" };
  }

  return {
    queued: { label: "On iPhone", tone: "warning" as StatusTone },
    written: { label: "Sending", tone: "warning" as StatusTone },
    sent: { label: "Sent", tone: "primary" as StatusTone },
  }[item.step];
}

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

/* Ce que permet la saisie : état de la file d'abord, puis celui du Mac. */
function editRules(
  item: QueuedExpense | undefined,
  entry: MobileEntry | undefined
): EditRules {
  if (item?.step === "written") {
    return { scope: "none", cancellable: false, note: "Being sent: changes are possible in a moment." };
  }

  if (item?.action === "cancel" && item.step !== "rejected") {
    return { scope: "none", cancellable: false, note: "Cancellation on its way to the Mac." };
  }

  if (entry?.state === "cancelled") {
    return { scope: "none", cancellable: false, note: "Cancelled." };
  }

  if (entry?.allocated) {
    return { scope: "none", cancellable: false, note: "Allocated in HomeTools: no change is possible." };
  }

  if (entry?.state === "linked") {
    return {
      scope: "classification",
      cancellable: true,
      note: "Linked to a bank movement: only the expense category, the merchant and the comment can change. Cancelling removes the link.",
    };
  }

  return { scope: "all", cancellable: true, note: "" };
}

function entryExpense(
  entry: MobileEntry
): MobileExpenseSave {
  return {
    id: entry.id,
    paidAt: entry.paidAt,
    cardId: entry.cardId,
    amount: entry.amount,
    currency: entry.currency,
    subCategoryId: entry.subCategoryId,
    comment: entry.comment,
    partyId: entry.partyId,
    partyName: entry.partyName,
    clientUpdatedAt: entry.clientUpdatedAt,
  };
}

/*
  Mouvement bancaire lié : date, texte de la banque et montant
  payé en CHF (amountChf est négatif pour une dépense ; affiché
  en positif comme les saisies). Jamais comparé au montant saisi.
*/
function movementText(
  entry: MobileEntry
): string {
  const movement =
    entry.movement;

  if (!movement) {
    return "";
  }

  const date =
    /^\d{4}-(\d{2})-(\d{2})/.exec(movement.date);

  return [
    "Bank",
    date ? `${date[2]}.${date[1]}` : movement.date,
    movement.text,
    `${formatAmount(-movement.amountChf)} CHF`,
  ]
    .filter(part => part !== "")
    .join(" · ");
}

/* Commerçant : partie (libellé actuel), sinon texte libre, sinon rien. */
function merchantText(
  expense: MobileExpenseSave
): string {
  return expense.partyId !== null
    ? partyLabel(expense.partyId)
    : expense.partyName ?? "";
}

/* Cartes publiées (toutes, propriétaire compris) : libellé et couleur. */
const cards =
  computed(() =>
    new Map(
      (mobileData.value?.paymentMeans ?? []).map(mean => [mean.cardId, mean])
    )
  );

function cardLabel(
  id: number
): string {
  return cards.value.get(id)?.label ?? `Card ${id}`;
}

function cardStyle(
  id: number
): Record<string, string> | undefined {
  const color =
    cards.value.get(id)?.color;

  return color
    ? { "--card-color": color }
    : undefined;
}

const rows =
  computed<HistoryRow[]>(() => {
    const entries =
      new Map(ownEntries.value.map(entry => [entry.id, entry]));

    const tooLong =
      new Set(
        (mobileData.value?.warnings ?? [])
          .filter(warning => warning.code === "OPEN_TOO_LONG")
          .map(warning => warning.id)
      );

    const queued =
      queue.value.map(item => {
        const entry =
          entries.get(item.expense.id);

        const state =
          queueState(item);

        return {
          ...editRules(item, entry),
          expense: item.expense,
          state: state.label,
          tone: state.tone,
          message: item.message,
          rejected: item.step === "rejected",
          openTooLong: false,
        };
      });

    const queuedIds =
      new Set(queue.value.map(item => item.expense.id));

    const published =
      ownEntries.value
        .filter(entry => !queuedIds.has(entry.id))
        .map(entry => {
          const state =
            entryState(entry);

          return {
            ...editRules(undefined, entry),
            expense: entryExpense(entry),
            state: state.label,
            tone: state.tone,
            message: movementText(entry),
            rejected: false,
            openTooLong: tooLong.has(entry.id),
          };
        });

    return [...queued, ...published]
      .sort((a, b) => b.expense.paidAt.localeCompare(a.expense.paidAt));
  });

/* Saisie ouverte dans le panneau ; ses règles suivent la file et mobile.json. */
const selectedId =
  ref<string | null>(null);

const selected =
  computed(() =>
    rows.value.find(row => row.expense.id === selectedId.value) ?? null
  );

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
        :key="row.expense.id"
        class="row"
      >
        <button
          type="button"
          class="row-open"
          @click="selectedId = row.expense.id"
        >
          <span class="row-main">
            <span class="row-title">
              {{ subCategoryLabel(row.expense.subCategoryId) }}
            </span>

            <span class="row-amount">
              {{ formatAmount(row.expense.amount) }} {{ row.expense.currency }}
            </span>
          </span>

          <span class="row-meta">
            <span>
              <span
                class="card-dot"
                :style="cardStyle(row.expense.cardId)"
              />
              {{ shortDateTime(row.expense.paidAt) }} · {{ cardLabel(row.expense.cardId) }}
              <template v-if="merchantText(row.expense)"> · {{ merchantText(row.expense) }}</template>
              <template v-if="row.expense.comment"> · {{ row.expense.comment }}</template>
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
          </span>

          <span
            v-if="row.message"
            class="row-message"
            :class="{ error: row.rejected }"
          >
            {{ row.message }}
          </span>
        </button>

        <button
          v-if="row.rejected"
          type="button"
          class="button discard"
          @click="discardExpense(row.expense.id)"
        >
          Discard
        </button>
      </li>
    </ul>

    <ExpenseSheet
      v-if="selected"
      :expense="selected.expense"
      :scope="selected.scope"
      :cancellable="selected.cancellable"
      :note="selected.note"
      @close="selectedId = null"
    />
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
  gap: 6px;

  padding: 10px 14px;

  border-top: 1px solid var(--border);
}

.row:first-child {
  border-top: none;
}

.row-open {
  display: flex;
  flex-direction: column;
  gap: 4px;

  width: 100%;
  padding: 0;

  border: none;

  background: none;
  color: inherit;

  font: inherit;
  text-align: left;

  cursor: pointer;
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

.card-dot {
  display: inline-block;

  width: 10px;
  height: 10px;
  margin-right: 4px;

  border-radius: 50%;

  background: var(--card-color, var(--text-muted));
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
}

.pills {
  display: inline-flex;
  gap: 4px;
}

.row-message {
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
