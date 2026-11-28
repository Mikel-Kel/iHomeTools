<script setup lang="ts">
import {
  computed,
  ref,
  useTemplateRef,
} from "vue";

import ExpenseForm from "@/components/ExpenseForm.vue";

import {
  addExpense,
  localDateTime,
  type ExpenseValues,
} from "@/services/mobile/expenseQueue";

import {
  deviceOwner,
  environment,
} from "@/services/environment/environmentState";

import {
  mobileData,
  ownPaymentMeans,
  ownSubCategories,
  subCategoryLabel,
} from "@/services/mobile/mobileData";

import {
  readReceipt,
  ReceiptError,
  receiptParty,
} from "@/services/receipt/receiptReader";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Saisie d'une dépense

   Formulaire commun (ExpenseForm.vue) ; seules les cartes et
   les sous-catégories du propriétaire de l'iPhone sont
   proposées (contrat mobile, § 5) ; sans l'une ou l'autre,
   pas de saisie. Date du paiement choisie dans le formulaire
   (aujourd'hui par défaut), heure celle de l'enregistrement.
   La saisie part dans la file d'attente (expenseQueue.ts),
   envoyée dès que le proxy répond.

   « Scan receipt » (capacité receiptRead, proxy joignable) :
   photo prise ou choisie, lue par le proxy
   (receiptReader.ts), qui préremplit montant, devise, date et
   commerçant ; note « check before saving », avec ce qui n'a
   pas été repris et le moyen de paiement s'il n'est pas une
   carte. Michel confirme toujours en enregistrant.
========================= */

const form =
  useTemplateRef<InstanceType<typeof ExpenseForm>>("form");

/* Message après un enregistrement. */
const confirmation =
  ref("");

const photoInput =
  useTemplateRef<HTMLInputElement>("photoInput");

const canScan =
  computed(() => environment.value?.capabilities.receiptRead === true);

const scanning =
  ref(false);

/* Résultat de la dernière lecture : notes à vérifier, ou échec. */
const scanNotes =
  ref<string[]>([]);

const scanError =
  ref("");

function chooseReceipt() {
  photoInput.value?.click();
}

async function onReceiptChosen() {
  const input =
    photoInput.value;

  const photo =
    input?.files?.[0];

  if (!input || !photo) {
    return;
  }

  scanning.value = true;
  scanNotes.value = [];
  scanError.value = "";
  confirmation.value = "";

  try {
    const reading =
      await readReceipt(photo);

    if (reading.amount === null && reading.date === null && !reading.merchant && !reading.merchantBrand) {
      scanError.value = "Nothing could be read on this receipt: enter the expense by hand.";
      return;
    }

    const party =
      receiptParty(reading);

    const notes =
      form.value?.prefill({
        amount: reading.amount,
        currency: reading.currency,
        paidDate: reading.date,
        partyId: party?.id ?? null,
        partyText: party ? null : reading.merchantBrand ?? reading.merchant,
      }) ?? [];

    if (reading.amount === null) {
      notes.unshift("Amount not read: enter it.");
    }

    if (reading.paymentMethod === "cash") {
      notes.push("The receipt says paid in cash.");
    } else if (reading.paymentMethod === "twint") {
      notes.push("The receipt says paid with TWINT.");
    }

    scanNotes.value = ["Read from the receipt: check before saving.", ...notes];

  } catch (err) {
    scanError.value =
      err instanceof ReceiptError
        ? err.message
        : "The receipt could not be read: enter the expense by hand.";

  } finally {
    scanning.value = false;

    /* Même photo choisie à nouveau : l'événement change repart. */
    input.value = "";
  }
}

function save(
  values: ExpenseValues,
  paidDate: string | null
) {
  const now =
    localDateTime(new Date());

  const day =
    paidDate ?? now.slice(0, 10);

  const saved =
    addExpense({
      ...values,
      paidAt: `${day}${now.slice(10)}`,
    });

  /* Autre jour qu'aujourd'hui : rappelé dans la confirmation (JJ.MM). */
  const dayNote =
    day === now.slice(0, 10)
      ? ""
      : ` (${day.slice(8, 10)}.${day.slice(5, 7)})`;

  confirmation.value =
    saved
      ? `${formatAmount(values.amount)} ${values.currency} · ${subCategoryLabel(values.subCategoryId)} saved${dayNote}.`
      : "Saved, but not kept on this iPhone: keep the app open until it is sent.";

  form.value?.reset();
  scanNotes.value = [];
  scanError.value = "";
}
</script>

<template>
  <div class="add-view">
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
      v-else-if="!ownPaymentMeans.length"
      class="state"
    >
      No card assigned to you yet: choose them in HomeTools › Master data.
    </p>

    <p
      v-else-if="!ownSubCategories.length"
      class="state"
    >
      No expense categories assigned to you yet: choose them in HomeTools › Master data.
    </p>

    <template v-else>
      <template v-if="canScan">
        <button
          type="button"
          class="button scan"
          :disabled="scanning"
          @click="chooseReceipt"
        >
          <svg
            class="scan-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.2-1.8A1.5 1.5 0 0 1 10.5 3.5h3a1.5 1.5 0 0 1 1.2.7L15.9 6h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
            <circle
              cx="12"
              cy="12.5"
              r="3.5"
            />
          </svg>

          {{ scanning ? "Reading receipt…" : "Scan receipt" }}
        </button>

        <input
          ref="photoInput"
          class="photo-input"
          type="file"
          accept="image/*"
          @change="onReceiptChosen"
        >

        <div
          v-if="scanNotes.length"
          class="scan-note"
          role="status"
        >
          <p
            v-for="note in scanNotes"
            :key="note"
          >
            {{ note }}
          </p>
        </div>

        <p
          v-if="scanError"
          class="scan-error"
          role="alert"
        >
          {{ scanError }}
        </p>
      </template>

      <ExpenseForm
        ref="form"
        submit-label="Save"
        with-date
        @submit="save"
        @amount-input="confirmation = ''"
      />

      <p
        v-if="confirmation"
        class="confirmation"
        role="status"
      >
        {{ confirmation }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.add-view {
  padding: var(--gutter);
}

.state {
  margin: 1rem 0 0;

  color: var(--text-soft);
  text-align: center;
}

.scan {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  width: 100%;
  margin: 0 0 0.9rem;
}

.scan-icon {
  flex: none;

  width: 22px;
  height: 22px;

  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.photo-input {
  display: none;
}

.scan-note {
  margin: 0 0 0.9rem;
  padding: 10px 12px;

  border: 1px solid var(--primary);
  border-radius: 12px;

  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--font-size-sm);
}

.scan-note p {
  margin: 0;
}

.scan-note p:first-child {
  font-weight: 600;
}

.scan-error {
  margin: 0 0 0.9rem;

  color: var(--negative);
  font-size: var(--font-size-sm);
  text-align: center;
}

.confirmation {
  margin: 1.1rem 0 0;

  color: var(--positive);
  text-align: center;
}
</style>
