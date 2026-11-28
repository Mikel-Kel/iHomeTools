<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

import MerchantField from "@/components/MerchantField.vue";

import { PARTY_NAME_MAX } from "@/contracts/mobile";

import type { ExpenseValues } from "@/services/mobile/expenseQueue";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import {
  currencies,
  mobileData,
  ownEntries,
  ownPaymentMeans,
  parties,
  ownSubCategories,
  subCategoryLabel,
} from "@/services/mobile/mobileData";

import {
  searchKey,
  tidyText,
} from "@/utils/searchText";

/* =========================
   Formulaire d'une dépense

   Montant, devise, carte, sous-catégorie, commerçant et
   commentaire facultatifs ; sous-catégories proposées
   suivies comme la carte (carte hors suivi : catégories hors
   suivi, contrat v0.10) ; utilisé par Add (nouvelle saisie) et par
   History (modification).

   Nouvelle saisie (initial absent) : dernière carte utilisée
   (ht:<envId>:mex.lastCard), sinon la première ; retenue à
   chaque enregistrement. Sous-catégorie proposée : la seule
   possible, sinon la plus utilisée parmi les saisies du
   propriétaire publiées dans mobile.json (60 derniers jours,
   hors annulées), dans l'ordre du Mac à égalité ; aucune
   sans saisie. Reproposée après un changement de carte qui
   l'efface et après chaque enregistrement. Modification : valeurs de la
   saisie ; sa carte et sa sous-catégorie restent proposées
   même si le Mac ne les propose plus (valeur inchangée
   acceptée, contrat § 4.1).

   Date du paiement (withDate) : Add, jour de l'iPhone
   proposé, qui suit le changement de jour tant qu'elle n'a
   pas été changée ; modification d'une saisie pas encore
   liée (scope all), jour de la saisie (initialDate). Choisie
   entre 60 jours en arrière (ou le jour de la saisie, s'il
   est plus ancien) et aujourd'hui : le Mac refuse un
   paiement dans le futur. L'heure n'est jamais choisie.

   Commerçant (MerchantField.vue, contrat v0.9) : partie
   choisie (partyId), sinon texte tapé ; un texte égal au
   libellé d'une partie (sans casse ni accents) devient cette
   partie, un autre part comme partyName.

   Champs modifiables (scope) : all ; classification
   (saisie liée : sous-catégorie, commerçant et commentaire,
   § 4.1) ;
   none (lecture seule). Seules les cartes et les
   sous-catégories du propriétaire de l'iPhone sont
   proposées (§ 5) ; bouton d'une carte sur le fond de sa
   couleur (texte noir ou blanc selon le contraste), neutre
   sans couleur. Devise de la carte à chaque
   choix de carte, modifiable (CHF et devises du fichier des
   cours).

   Ticket de caisse lu (Add, prefill) : carte du propriétaire
   dont les 4 derniers chiffres sont ceux du ticket (une
   seule, contrat mobile v0.13 ; aucune ou plusieurs : carte
   gardée), montant, devise proposée (CHF ou devise du
   fichier des cours), jour dans les limites de la date et
   commerçant repris ; sous-catégorie et commentaire ne
   changent pas (sauf sous-catégorie qui ne va plus avec la
   carte). Ce qui
   n'est pas repris est rendu à Add, qui le signale.

   Mêmes contrôles que le Mac (§ 4.3) : montant positif, deux
   décimales au plus ; commentaire de 50 caractères au plus.
   En modification, enregistrable seulement si une valeur a
   changé.
========================= */

/* Valeurs lues sur un ticket (null : rien à reprendre). */
export interface FormPrefill {
  /* 4 derniers chiffres de la carte du ticket. */
  cardDigits: string | null;

  amount: number | null;
  currency: string | null;

  /* AAAA-MM-JJ */
  paidDate: string | null;

  partyId: number | null;
  partyText: string | null;
}

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
      withDate?: boolean;
      /* Modification : jour de la saisie, AAAA-MM-JJ. */
      initialDate?: string | null;
    }>(),
    {
      initial: null,
      scope: "all",
      withDate: false,
      initialDate: null,
    }
  );

const emit =
  defineEmits<{
    /* paidDate : AAAA-MM-JJ choisi (withDate), sinon null. */
    submit: [values: ExpenseValues, paidDate: string | null];

    /* Le montant change : Add efface sa confirmation. */
    amountInput: [];
  }>();

const COMMENT_MAX = 50;

const AMOUNT_MAX = 9_999_999;

const LAST_CARD = "mex.lastCard";

const DATE_DAYS_BACK = 60;

interface CardOption {
  cardId: number;
  label: string;
  color: string | null;
  currency: string;
  tracked: boolean;
  cardDigits: string | null;
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

const merchantId =
  ref<number | null>(props.initial?.partyId ?? null);

const merchantText =
  ref(props.initial?.partyName ?? "");

/* Ce qui part au Mac : au plus l'un des deux. */
const party =
  computed<{ partyId: number | null; partyName: string | null }>(() => {
    if (merchantId.value !== null) {
      return { partyId: merchantId.value, partyName: null };
    }

    const name =
      tidyText(merchantText.value);

    if (!name) {
      return { partyId: null, partyName: null };
    }

    const key =
      searchKey(name);

    const match =
      parties.value.find(item => searchKey(item.label) === key);

    return match
      ? { partyId: match.id, partyName: null }
      : { partyId: null, partyName: name };
  });

/* Jour local, AAAA-MM-JJ. */
function dayText(
  date: Date
): string {
  const pad =
    (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const today =
  ref(dayText(new Date()));

const earliestDay =
  computed(() => {
    const date =
      new Date(`${today.value}T12:00:00`);

    date.setDate(date.getDate() - DATE_DAYS_BACK);

    const limit =
      dayText(date);

    return props.initialDate && props.initialDate < limit
      ? props.initialDate
      : limit;
  });

const paidDate =
  ref(props.initialDate ?? today.value);

/* Changement de jour : la date proposée suit, sauf si elle a été choisie. */
watch(today, (current, previous) => {
  if (!props.initialDate && paidDate.value === previous) {
    paidDate.value = current;
  }
});

function refreshToday() {
  today.value = dayText(new Date());
}

function onVisible() {
  if (document.visibilityState === "visible") {
    refreshToday();
  }
}

onMounted(() => {
  document.addEventListener("visibilitychange", onVisible);
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisible);
});

const dateValid =
  computed(() =>
    !props.withDate ||
    (/^\d{4}-\d{2}-\d{2}$/.test(paidDate.value) &&
      paidDate.value >= earliestDay.value &&
      paidDate.value <= today.value)
  );

const dateError =
  computed(() =>
    props.withDate && !dateValid.value
      ? `A date between ${DATE_DAYS_BACK} days ago and today.`
      : ""
  );

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
        color: known?.color ?? null,
        currency: known?.currency ?? props.initial!.currency,
        tracked: known?.tracked ?? true,
        cardDigits: known?.cardDigits ?? null,
      },
    ];
  });

/* Carte choisie suivie, ou hors suivi (contrat v0.10). */
const cardTracked =
  computed(() => cards.value.find(card => card.cardId === cardId.value)?.tracked ?? true);

/*
  Sous-catégories du propriétaire suivies comme la carte
  choisie ; carte de la saisie modifiée inchangée : sa
  sous-catégorie reste proposée même si elle n'en fait plus
  partie (valeur inchangée acceptée).
*/
const subCategories =
  computed<SubCategoryOption[]>(() => {
    const offered: SubCategoryOption[] =
      ownSubCategories.value.filter(sub => sub.tracked === cardTracked.value);

    const initialId =
      props.initial?.subCategoryId;

    return (
      initialId === undefined ||
      cardId.value !== props.initial?.cardId ||
      offered.some(sub => sub.subCategoryId === initialId)
    )
      ? offered
      : [...offered, { subCategoryId: initialId, label: subCategoryLabel(initialId) }];
  });

/* Nouvelle saisie : la seule sous-catégorie proposée, sinon la plus utilisée ; null sans saisie. */
function defaultSubCategory(
  list: SubCategoryOption[]
): number | null {
  if (props.initial || !list.length) {
    return null;
  }

  if (list.length === 1) {
    return list[0].subCategoryId;
  }

  const uses =
    new Map<number, number>();

  for (const entry of ownEntries.value) {
    if (entry.state !== "cancelled") {
      uses.set(entry.subCategoryId, (uses.get(entry.subCategoryId) ?? 0) + 1);
    }
  }

  let best: number | null = null;
  let bestUses = 0;

  for (const sub of list) {
    const count =
      uses.get(sub.subCategoryId) ?? 0;

    if (count > bestUses) {
      best = sub.subCategoryId;
      bestUses = count;
    }
  }

  return best;
}

/* Autre carte : une sous-catégorie qui ne correspond plus est effacée, puis reproposée. */
watch(
  subCategories,

  list => {
    if (subCategoryId.value !== null && !list.some(sub => sub.subCategoryId === subCategoryId.value)) {
      subCategoryId.value = null;
    }

    if (subCategoryId.value === null) {
      subCategoryId.value = defaultSubCategory(list);
    }
  },

  {
    immediate: true,
  }
);

/* Texte noir ou blanc, le plus lisible sur le fond (luminance relative, WCAG). */
function readableText(
  hex: string
): string {
  const [r, g, b] =
    [1, 3, 5]
      .map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
      .map(channel =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4
      );

  const luminance =
    0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.179
    ? "#000000"
    : "#FFFFFF";
}

function cardStyle(
  color: string | null
): Record<string, string> | undefined {
  return color
    ? { "--card-bg": color, "--card-text": readableText(color) }
    : undefined;
}

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
      trimmedComment.value !== initial.comment ||
      party.value.partyId !== initial.partyId ||
      party.value.partyName !== initial.partyName ||
      (props.withDate && paidDate.value !== props.initialDate)
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
    trimmedComment.value.length <= COMMENT_MAX &&
    dateValid.value
  );

function save() {
  refreshToday();

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
    ...party.value,
  }, props.withDate ? paidDate.value : null);
}

/* Après un enregistrement dans Add : carte gardée, date du jour, le reste vidé. */
function reset() {
  refreshToday();
  paidDate.value = today.value;
  amountText.value = "";
  subCategoryId.value = defaultSubCategory(subCategories.value);
  comment.value = "";
  merchantId.value = null;
  merchantText.value = "";
  currency.value = cardCurrency(cardId.value);
}

/* JJ.MM.AAAA */
function displayDay(
  day: string
): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

/* Ticket lu : valeurs reprises dans le formulaire ; rend ce qui n'a pas pu l'être. */
function prefill(
  values: FormPrefill
): string[] {
  const skipped: string[] = [];

  refreshToday();

  if (values.cardDigits) {
    const matches =
      cards.value.filter(card => card.cardDigits === values.cardDigits);

    const kept =
      cards.value.find(card => card.cardId === cardId.value)?.label ?? "the chosen card";

    if (matches.length === 1) {
      selectCard(matches[0].cardId);
    } else if (matches.length > 1) {
      skipped.push(`Several of your cards end with ${values.cardDigits}: ${kept} kept.`);
    } else {
      skipped.push(`No card of yours ends with ${values.cardDigits}: ${kept} kept.`);
    }
  }

  if (values.amount !== null && values.amount <= AMOUNT_MAX) {
    amountText.value = values.amount.toFixed(2);
  }

  if (values.currency) {
    if (values.currency === cardCurrency(cardId.value) || currencies.value.includes(values.currency)) {
      currency.value = values.currency;
    } else {
      skipped.push(`Currency ${values.currency} is not offered: ${currency.value} kept.`);
    }
  }

  if (values.paidDate) {
    if (values.paidDate >= earliestDay.value && values.paidDate <= today.value) {
      paidDate.value = values.paidDate;
    } else {
      skipped.push(`Receipt date ${displayDay(values.paidDate)} is out of range: ${displayDay(paidDate.value)} kept.`);
    }
  }

  if (values.partyId !== null) {
    merchantId.value = values.partyId;
    merchantText.value = "";
  } else if (values.partyText) {
    merchantId.value = null;
    merchantText.value = values.partyText.slice(0, PARTY_NAME_MAX);
  }

  return skipped;
}

defineExpose({
  prefill,
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

    <!-- Date -->

    <section
      v-if="withDate"
      class="field"
    >
      <h2>Date</h2>

      <input
        v-model="paidDate"
        class="date-input"
        type="date"
        aria-label="Date of the payment"
        :min="earliestDay"
        :disabled="!amountEditable"
        :max="today"
      >

      <p
        v-if="dateError"
        class="field-error"
      >
        {{ dateError }}
      </p>
    </section>

    <!-- Card -->

    <section class="field">
      <h2>Card</h2>

      <div class="choices cards">
        <button
          v-for="card in cards"
          :key="card.cardId"
          type="button"
          class="choice"
          :class="{ selected: card.cardId === cardId, colored: !!card.color }"
          :style="cardStyle(card.color)"
          :aria-pressed="card.cardId === cardId"
          :disabled="!amountEditable"
          @click="selectCard(card.cardId)"
        >
          <span class="card-label">{{ card.label }}</span>
        </button>
      </div>
    </section>

    <!-- Sub-category -->

    <section class="field">
      <h2>Expense category</h2>

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

    <!-- Merchant -->

    <section class="field">
      <h2>Merchant</h2>

      <MerchantField
        v-model:party-id="merchantId"
        v-model:text="merchantText"
        :disabled="!classificationEditable"
      />
    </section>

    <!-- Comment -->

    <section class="field">
      <h2>Comment</h2>

      <input
        v-model="comment"
        type="text"
        :maxlength="COMMENT_MAX"
        placeholder="Please comment"
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

.date-input {
  width: 100%;
  min-height: 44px;
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

/* Cartes : une seule ligne sur toute la largeur, même taille, libellé tronqué (…). */
.choices.cards {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
}

.cards .choice {
  min-width: 0;
  padding: 6px 8px;
}

.card-label {
  display: block;

  overflow: hidden;

  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Carte colorée : fond de sa couleur ; choisie, anneau autour du bouton. */
.choice.colored {
  border-color: rgba(0, 0, 0, 0.15);

  background: var(--card-bg);
  color: var(--card-text);
}

.choice.colored.selected {
  box-shadow:
    0 0 0 2px var(--bg),
    0 0 0 4px var(--primary);
}

.choice:disabled {
  opacity: 0.55;

  cursor: default;
}

.save {
  width: 100%;
}
</style>
