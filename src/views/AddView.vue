<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from "vue";

import { addExpense, localDateTime } from "@/services/mobile/expenseQueue";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import { deviceOwner } from "@/services/environment/environmentState";

import {
  currencies,
  mobileData,
  ownPaymentMeans,
} from "@/services/mobile/mobileData";

import { formatAmount } from "@/utils/amountFormat";

/* =========================
   Saisie d'une dépense

   Montant, carte, sous-catégorie et commentaire facultatif ;
   seules les cartes du propriétaire de l'iPhone sont
   proposées (contrat mobile, § 5) ;
   devise de la carte par défaut, modifiable (CHF et devises
   du fichier des cours). L'heure du paiement est celle de
   l'enregistrement. La saisie part dans la file d'attente
   (expenseQueue.ts), envoyée dès que le proxy répond.

   Dernière carte utilisée retenue (ht:<envId>:mex.lastCard).
   Mêmes contrôles que le Mac (contrat § 4.3) : montant
   positif, deux décimales au plus ; commentaire de 50
   caractères au plus.
========================= */

const COMMENT_MAX = 50;

const AMOUNT_MAX = 9_999_999;

const LAST_CARD = "mex.lastCard";

const means =
  ownPaymentMeans;

const subCategories =
  computed(() => mobileData.value?.subCategories ?? []);

const amountText =
  ref("");

const cardId =
  ref<number | null>(null);

const currency =
  ref("");

const subCategoryId =
  ref<number | null>(null);

const comment =
  ref("");

/* Message après un enregistrement. */
const confirmation =
  ref("");

const card =
  computed(() =>
    means.value.find(mean => mean.cardId === cardId.value) ?? null
  );

/* Carte retenue, sinon la première ; carte retirée du Mac : la première. */
watch(
  means,

  list => {
    if (list.some(mean => mean.cardId === cardId.value)) {
      return;
    }

    const last =
      readStored(LAST_CARD, raw => (typeof raw === "number" ? raw : null));

    cardId.value =
      list.find(mean => mean.cardId === last)?.cardId ??
      list[0]?.cardId ??
      null;
  },

  {
    immediate: true,
  }
);

/* Devise de la carte à chaque changement de carte. */
watch(
  card,

  current => {
    currency.value =
      current?.currency ?? "";
  },

  {
    immediate: true,
  }
);

const currencyOptions =
  computed(() =>
    currency.value && !currencies.value.includes(currency.value)
      ? [currency.value, ...currencies.value]
      : currencies.value
  );

/* Montant saisi : virgule ou point, deux décimales au plus ; null si invalide. */
const amount =
  computed(() => {
    const text =
      amountText.value.trim().replace(",", ".");

    if (!/^\d+(\.\d{1,2})?$/.test(text)) {
      return null;
    }

    const value =
      Number(text);

    return value > 0 && value <= AMOUNT_MAX
      ? value
      : null;
  });

const amountError =
  computed(() =>
    amountText.value.trim() && amount.value === null
      ? "A positive amount with at most 2 decimals."
      : ""
  );

const trimmedComment =
  computed(() => comment.value.trim().replace(/\s+/g, " "));

const canSave =
  computed(() =>
    amount.value !== null &&
    cardId.value !== null &&
    !!currency.value &&
    subCategoryId.value !== null &&
    trimmedComment.value.length <= COMMENT_MAX
  );

function save() {
  if (!canSave.value) {
    return;
  }

  const saved =
    addExpense({
      paidAt: localDateTime(new Date()),
      cardId: cardId.value!,
      amount: amount.value!,
      currency: currency.value,
      subCategoryId: subCategoryId.value!,
      comment: trimmedComment.value,
    });

  writeStored(LAST_CARD, cardId.value);

  const label =
    subCategories.value.find(sub => sub.subCategoryId === subCategoryId.value)?.label ?? "";

  confirmation.value =
    saved
      ? `${formatAmount(amount.value)} ${currency.value} · ${label} saved.`
      : "Saved, but not kept on this iPhone: keep the app open until it is sent.";

  amountText.value = "";
  subCategoryId.value = null;
  comment.value = "";
  currency.value = card.value?.currency ?? "";
}

/* Nouvelle saisie : le message précédent disparaît. */
watch(
  amountText,

  value => {
    if (value) {
      confirmation.value = "";
    }
  }
);
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
      v-else-if="!means.length || !subCategories.length"
      class="state"
    >
      No card or sub-category offered to {{ deviceOwner }} yet: choose them in HomeTools, Master data.
    </p>

    <form
      v-else
      class="form"
      @submit.prevent="save"
    >
      <!-- Amount -->

      <div class="amount-row">
        <input
          v-model="amountText"
          class="amount-input"
          type="text"
          inputmode="decimal"
          enterkeyhint="done"
          placeholder="0.00"
          aria-label="Amount"
          autocomplete="off"
        >

        <select
          v-model="currency"
          class="currency-select"
          aria-label="Currency"
        >
          <option
            v-for="code in currencyOptions"
            :key="code"
            :value="code"
          >
            {{ code }}
          </option>
        </select>
      </div>

      <p
        v-if="amountError"
        class="field-error"
      >
        {{ amountError }}
      </p>

      <!-- Card -->

      <section class="field">
        <h2>Card</h2>

        <div class="choices">
          <button
            v-for="mean in means"
            :key="mean.cardId"
            type="button"
            class="choice"
            :class="{ selected: mean.cardId === cardId }"
            :aria-pressed="mean.cardId === cardId"
            @click="cardId = mean.cardId"
          >
            {{ mean.label }}
          </button>
        </div>
      </section>

      <!-- Sub-category -->

      <section class="field">
        <h2>Sub-category</h2>

        <div class="choices grid">
          <button
            v-for="sub in subCategories"
            :key="sub.subCategoryId"
            type="button"
            class="choice"
            :class="{ selected: sub.subCategoryId === subCategoryId }"
            :aria-pressed="sub.subCategoryId === subCategoryId"
            @click="subCategoryId = sub.subCategoryId"
          >
            {{ sub.label }}
          </button>
        </div>
      </section>

      <!-- Comment -->

      <section class="field">
        <h2>Comment</h2>

        <input
          v-model="comment"
          type="text"
          :maxlength="COMMENT_MAX"
          placeholder="Optional"
          enterkeyhint="done"
          autocomplete="off"
        >
      </section>

      <button
        type="submit"
        class="button primary save"
        :disabled="!canSave"
      >
        Save
      </button>

      <p
        v-if="confirmation"
        class="confirmation"
        role="status"
      >
        {{ confirmation }}
      </p>
    </form>
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

.form {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.amount-row {
  display: flex;
  gap: 0.5rem;
}

.amount-input {
  flex: 1;
  min-width: 0;

  font-size: 2rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.currency-select {
  flex: none;
  width: 92px;
}

.field-error {
  margin: -0.6rem 0 0;

  color: var(--negative);
  font-size: var(--font-size-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.field h2 {
  margin: 0;

  color: var(--text-soft);
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.choices.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.choice {
  min-height: 44px;
  padding: 6px 14px;

  border: 1px solid var(--border-strong);
  border-radius: 12px;

  background: var(--surface);
  color: var(--text);

  font-weight: 600;
  overflow-wrap: anywhere;

  cursor: pointer;
}

.choice.selected {
  border-color: var(--primary);

  background: var(--primary-soft);
  color: var(--primary);
}

.save {
  width: 100%;
}

.confirmation {
  margin: 0;

  color: var(--positive);
  text-align: center;
}
</style>
