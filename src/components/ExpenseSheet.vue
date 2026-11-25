<script setup lang="ts">
import {
  onBeforeUnmount,
  ref,
} from "vue";

import ExpenseForm, { type FormScope } from "@/components/ExpenseForm.vue";

import type { MobileExpenseSave } from "@/contracts/mobile";

import {
  cancelExpense,
  updateExpense,
  type ExpenseValues,
  type QueueChange,
} from "@/services/mobile/expenseQueue";

/* =========================
   Modification d'une saisie (History)

   Panneau du bas de l'écran : heure du paiement (non
   modifiable), formulaire commun pré-rempli et annulation.
   Champs modifiables et annulation selon l'état, décidés par
   History (contrat § 4.1 et § 4.2) ; note expliquant une
   limite. Annulation en deux touchers (« Tap again to
   confirm », 4 secondes).

   Modification et annulation partent dans la file d'attente
   (expenseQueue.ts) ; le panneau se ferme quand elles y sont.
   Envoi en cours : message, le panneau reste ouvert.
========================= */

const props =
  defineProps<{
    /* Dernière version voulue : file de l'iPhone, sinon mobile.json. */
    expense: MobileExpenseSave;

    scope: FormScope;
    cancellable: boolean;
    note: string;
  }>();

const emit =
  defineEmits<{
    close: [];
  }>();

const CONFIRM_DELAY_MS = 4000;

const confirming =
  ref(false);

const message =
  ref("");

let confirmTimer: number | undefined;

/* AAAA-MM-JJTHH:MM:SS → JJ.MM.AAAA HH:MM */
function dateTime(
  value: string
): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);

  return match
    ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}`
    : value;
}

function done(
  change: QueueChange
) {
  if (change === "busy") {
    message.value = "Being sent: try again in a moment.";
    return;
  }

  if (change === "notKept") {
    window.alert("Not kept on this iPhone: keep the app open until it is sent.");
  }

  emit("close");
}

function save(
  values: ExpenseValues
) {
  done(updateExpense({ ...props.expense, ...values }));
}

function cancel() {
  if (!confirming.value) {
    confirming.value = true;
    confirmTimer = window.setTimeout(() => {
      confirming.value = false;
    }, CONFIRM_DELAY_MS);
    return;
  }

  window.clearTimeout(confirmTimer);
  confirming.value = false;

  done(cancelExpense(props.expense));
}

onBeforeUnmount(() => {
  window.clearTimeout(confirmTimer);
});
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
        aria-labelledby="expense-sheet-title"
      >
        <header class="sheet-header">
          <h2 id="expense-sheet-title">
            Expense
          </h2>

          <button
            type="button"
            class="button"
            @click="emit('close')"
          >
            Close
          </button>
        </header>

        <p class="paid">
          Paid {{ dateTime(expense.paidAt) }}
        </p>

        <p
          v-if="note"
          class="note"
        >
          {{ note }}
        </p>

        <ExpenseForm
          :key="expense.id"
          :initial="expense"
          :scope="scope"
          submit-label="Save changes"
          @submit="save"
        />

        <button
          v-if="cancellable"
          type="button"
          class="button cancel"
          :class="{ confirming }"
          @click="cancel"
        >
          {{ confirming ? "Tap again to confirm" : "Cancel expense" }}
        </button>

        <p
          v-if="message"
          class="message"
          role="status"
        >
          {{ message }}
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
  gap: 1rem;

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
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.sheet-header h2 {
  margin: 0;

  font-size: var(--font-size-lg);
}

.paid {
  margin: -0.4rem 0 0;

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

.cancel {
  width: 100%;

  color: var(--negative);
}

.cancel.confirming {
  background: var(--negative);
  color: var(--surface);
}

.message {
  margin: 0;

  color: var(--warning);
  text-align: center;
}
</style>
