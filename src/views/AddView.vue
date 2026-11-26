<script setup lang="ts">
import {
  ref,
  useTemplateRef,
} from "vue";

import ExpenseForm from "@/components/ExpenseForm.vue";

import {
  addExpense,
  localDateTime,
  type ExpenseValues,
} from "@/services/mobile/expenseQueue";

import { deviceOwner } from "@/services/environment/environmentState";

import {
  mobileData,
  ownPaymentMeans,
  ownSubCategories,
  subCategoryLabel,
} from "@/services/mobile/mobileData";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Saisie d'une dépense

   Formulaire commun (ExpenseForm.vue) ; seules les cartes et
   les sous-catégories du propriétaire de l'iPhone sont
   proposées (contrat mobile, § 5) ; sans l'une ou l'autre,
   pas de saisie. L'heure du paiement est celle de l'enregistrement.
   La saisie part dans la file d'attente (expenseQueue.ts),
   envoyée dès que le proxy répond.
========================= */

const form =
  useTemplateRef<InstanceType<typeof ExpenseForm>>("form");

/* Message après un enregistrement. */
const confirmation =
  ref("");

function save(
  values: ExpenseValues
) {
  const saved =
    addExpense({
      ...values,
      paidAt: localDateTime(new Date()),
    });

  confirmation.value =
    saved
      ? `${formatAmount(values.amount)} ${values.currency} · ${subCategoryLabel(values.subCategoryId)} saved.`
      : "Saved, but not kept on this iPhone: keep the app open until it is sent.";

  form.value?.reset();
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
      <ExpenseForm
        ref="form"
        submit-label="Save"
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

.confirmation {
  margin: 1.1rem 0 0;

  color: var(--positive);
  text-align: center;
}
</style>
