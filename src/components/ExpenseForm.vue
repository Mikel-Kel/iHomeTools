<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from "vue";

import type { ExpenseValues } from "@/services/mobile/expenseQueue";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import {
  currencies,
  mobileData,
  ownPaymentMeans,
} from "@/services/mobile/mobileData";

/* =========================
   Formulaire d'une dépense

   Montant, devise, carte, sous-catégorie et commentaire
   facultatif ; utilisé par Add (nouvelle saisie) et par
   History (modification).

   Nouvelle saisie (initial absent) : dernière carte utilisée
   (ht:<envId>:mex.lastCard), sinon la première ; retenue à
   chaque enregistrement. Modification : valeurs de la
   saisie ; sa carte et sa sous-catégorie restent proposées
   même si le Mac ne les propose plus (valeur inchangée
   acceptée, contrat § 4.1).

   Champs modifiables (scope) : all ; classification
   (saisie liée : sous-catégorie et commentaire, § 4.1) ;
   none (lecture seule). Seules les cartes du propriétaire de
   l'iPhone sont proposées (§ 5). Devise de la carte à chaque
   choix de carte, modifiable (CHF et devises du fichier des
   cours).

   Mêmes contrôles que le Mac (§ 4.3) : montant positif, deux
   décimales au plus ; commentaire de 50 caractères au plus.
   En modification, enregistrable seulement si une valeur a
   changé.
========================= */

export type FormScope =
  | "all"
  | "classification"
  | "none";

const props =
  withDefaults(
    defineProps<{
      initial?: ExpenseValues | null;
      scope?: FormScope;
      submitLabel: string;
    }>(),
    {
      initial: null,
      scope: "all",
    }
  );

const emit =
  defineEmits<{
    submit: [values: ExpenseValues];

    /* Le montant change : Add efface sa confirmation. */
    amountInput: [];
  }>();

const COMMENT_MAX = 50;

const AMOUNT_MAX = 9_999_999;

const LAST_CARD = "mex.lastCard";

interface CardOption {
  cardId: number;
  label: string;
  currency: string;
}

interface SubCategoryOption {
  subCategoryId: number;
  label: string;
}

const amountText =
  ref(props.initial ? props.initial.amount.toFixed(2) : "");

const cardId =
  ref<number | null>(props.initial?.cardId ?? null);

const currency =
  ref(props.initial?.currency ?? "");

const subCategoryId =
  ref<number | null>(props.initial?.subCategoryId ?? null);

const comment =
  ref(props.initial?.comment ?? "");

const amountEditable =
  computed(() => props.scope === "all");

const classificationEditable =
  computed(() => props.scope !== "none");

/* Cartes du propriétaire, plus celle de la saisie modifiée si elle n'en fait plus partie. */
const cards =
  computed<CardOption[]>(() => {
    const own: CardOption[] =
      ownPaymentMeans.value;

    const initialId =
      props.initial?.cardId;

    if (initialId === undefined || own.some(mean => mean.cardId === initialId)) {
      return own;
    }

    const known =
      mobileData.value?.paymentMeans.find(mean => mean.cardId === initialId);

    return [
      ...own,
      {
        cardId: initialId,
        label: known?.label ?? `Card ${initialId}`,
        currency: known?.currency ?? props.initial!.currency,
      },
    ];
  });

/* Sous-catégories proposées, plus celle de la saisie modifiée si elle n'en fait plus partie. */
const subCategories =
  computed<SubCategoryOption[]>(() => {
    const offered: SubCategoryOption[] =
      mobileData.value?.subCategories ?? [];

    const initialId =
      props.initial?.subCategoryId;

    return initialId === undefined || offered.some(sub => sub.subCategoryId === initialId)
      ? offered
      : [...offered, { subCategoryId: initialId, label: `Sub-category ${initialId}` }];
  });

function cardCurrency(
  id: number | null
): string {
  return cards.value.find(card => card.cardId === id)?.currency ?? "";
}

function selectCard(
  id: number
) {
  cardId.value = id;
  currency.value = cardCurrency(id);
}

/* Nouvelle saisie : carte retenue, sinon la première ; carte retirée du Mac : la première. */
watch(
  cards,

  list => {
    if (props.initial || list.some(card => card.cardId === cardId.value)) {
      return;
    }

    const last =
      readStored(LAST_CARD, raw => (typeof raw === "number" ? raw : null));

    const id =
      list.find(card => card.cardId === last)?.cardId ??
      list[0]?.cardId ??
      null;

    cardId.value = id;
    currency.value = cardCurrency(id);
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

const changed =
  computed(() => {
    const initial =
      props.initial;

    return (
      !initial ||
      amount.value !== initial.amount ||
      cardId.value !== initial.cardId ||
      currency.value !== initial.currency ||
      subCategoryId.value !== initial.subCategoryId ||
      trimmedComment.value !== initial.comment
    );
  });

const canSave =
  computed(() =>
    props.scope !== "none" &&
    changed.value &&
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

  if (!props.initial) {
    writeStored(LAST_CARD, cardId.value);
  }

  emit("submit", {
    cardId: cardId.value!,
    amount: amount.value!,
    currency: currency.value,
    subCategoryId: subCategoryId.value!,
    comment: trimmedComment.value,
  });
}

/* Après un enregistrement dans Add : carte gardée, le reste vidé. */
function reset() {
  amountText.value = "";
  subCategoryId.value = null;
  comment.value = "";
  currency.value = cardCurrency(cardId.value);
}

defineExpose({
  reset,
});

watch(
  amountText,

  value => {
    if (value) {
      emit("amountInput");
    }
  }
);
</script>

<template>
  <form
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
        :disabled="!amountEditable"
      >

      <select
        v-model="currency"
        class="currency-select"
        aria-label="Currency"
        :disabled="!amountEditable"
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
          v-for="card in cards"
          :key="card.cardId"
          type="button"
          class="choice"
          :class="{ selected: card.cardId === cardId }"
          :aria-pressed="card.cardId === cardId"
          :disabled="!amountEditable"
          @click="selectCard(card.cardId)"
        >
          {{ card.label }}
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
          :disabled="!classificationEditable"
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
        :disabled="!classificationEditable"
      >
    </section>

    <button
      v-if="scope !== 'none'"
      type="submit"
      class="button primary save"
      :disabled="!canSave"
    >
      {{ submitLabel }}
    </button>
  </form>
</template>

<style scoped>
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

.choice:disabled {
  opacity: 0.55;

  cursor: default;
}

.save {
  width: 100%;
}
</style>
