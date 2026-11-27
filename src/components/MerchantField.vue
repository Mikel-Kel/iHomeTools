<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useTemplateRef,
} from "vue";

import { PARTY_NAME_MAX } from "@/contracts/mobile";
import type { Party } from "@/contracts/parties";

import {
  parties,
  partyLabel,
} from "@/services/mobile/mobileData";

import { searchKey } from "@/utils/searchText";

/* =========================
   Commerçant d'une saisie (ExpenseForm)

   Facultatif. Recherche dès 2 lettres dans le libellé et les
   alias des parties (settings/parties.json, mobileData.ts),
   sans casse ni accents : libellé qui commence par le texte,
   puis mot qui commence par le texte, puis libellé ou alias
   qui le contient ; à rang égal, les plus utilisées d'abord.
   6 propositions au plus, puis « Use “…” as new merchant ».

   partyId : partie choisie (affichée avec ✕ pour l'effacer) ;
   sinon text : texte tapé, envoyé comme partyName s'il ne
   correspond exactement à aucune partie (ExpenseForm).
   Sans liste des parties : texte libre seulement.
========================= */

defineProps<{
  disabled: boolean;
}>();

const partyId =
  defineModel<number | null>("partyId", { required: true });

const text =
  defineModel<string>("text", { required: true });

const MIN_QUERY = 2;

const MAX_SUGGESTIONS = 6;

/* Délai avant de fermer la liste quand le champ perd le focus : le toucher d'une proposition passe d'abord. */
const BLUR_DELAY_MS = 150;

const input =
  useTemplateRef<HTMLInputElement>("input");

const open =
  ref(false);

let blurTimer: number | undefined;

interface IndexedParty {
  party: Party;
  label: string;
  aliases: string[];
}

const index =
  computed<IndexedParty[]>(() =>
    parties.value.map(party => ({
      party,
      label: searchKey(party.label),
      aliases: party.aliases.map(searchKey),
    }))
  );

const query =
  computed(() => searchKey(text.value));

/* 0 : libellé qui commence par le texte ; 1 : un mot ; 2 : libellé contenu ; 3 : alias ; null : aucun. */
function rank(
  item: IndexedParty,
  value: string
): number | null {
  if (item.label.startsWith(value)) {
    return 0;
  }

  if (item.label.includes(` ${value}`)) {
    return 1;
  }

  if (item.label.includes(value)) {
    return 2;
  }

  return item.aliases.some(alias => alias.includes(value))
    ? 3
    : null;
}

/* Liste déjà triée par usage : le tri stable garde cet ordre à rang égal. */
const suggestions =
  computed<Party[]>(() => {
    if (query.value.length < MIN_QUERY) {
      return [];
    }

    return index.value
      .map(item => ({ party: item.party, rank: rank(item, query.value) }))
      .filter((item): item is { party: Party; rank: number } => item.rank !== null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_SUGGESTIONS)
      .map(item => item.party);
  });

const exactMatch =
  computed(() =>
    query.value !== "" &&
    index.value.some(item => item.label === query.value)
  );

const showList =
  computed(() =>
    open.value &&
    query.value.length >= MIN_QUERY
  );

function onFocus() {
  window.clearTimeout(blurTimer);
  open.value = true;
}

function onBlur() {
  blurTimer = window.setTimeout(() => {
    open.value = false;
  }, BLUR_DELAY_MS);
}

function close() {
  window.clearTimeout(blurTimer);
  open.value = false;
  input.value?.blur();
}

function choose(
  party: Party
) {
  partyId.value = party.id;
  text.value = "";
  close();
}

async function clear() {
  partyId.value = null;
  text.value = "";

  await nextTick();
  input.value?.focus();
}

onBeforeUnmount(() => {
  window.clearTimeout(blurTimer);
});
</script>

<template>
  <div class="merchant">
    <div
      v-if="partyId !== null"
      class="selected"
    >
      <span class="selected-label">{{ partyLabel(partyId) }}</span>

      <button
        v-if="!disabled"
        type="button"
        class="clear"
        aria-label="Clear merchant"
        @click="clear"
      >
        ✕
      </button>
    </div>

    <template v-else>
      <input
        ref="input"
        v-model="text"
        type="text"
        :maxlength="PARTY_NAME_MAX"
        placeholder="Search or type a merchant"
        enterkeyhint="done"
        autocomplete="off"
        autocapitalize="words"
        :disabled="disabled"
        @focus="onFocus"
        @blur="onBlur"
        @keydown.enter.prevent="close"
      >

      <ul
        v-if="showList"
        class="suggestions"
      >
        <li
          v-for="party in suggestions"
          :key="party.id"
        >
          <button
            type="button"
            class="suggestion"
            @mousedown.prevent
            @click="choose(party)"
          >
            {{ party.label }}
          </button>
        </li>

        <li v-if="!exactMatch">
          <button
            type="button"
            class="suggestion new"
            @mousedown.prevent
            @click="close"
          >
            Use “{{ text.trim() }}” as new merchant
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.merchant {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.selected {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  min-height: 44px;
  padding: 0 4px 0 12px;

  border: 1px solid var(--primary);
  border-radius: 12px;

  background: var(--primary-soft);
  color: var(--primary);

  font-weight: 600;
}

.selected-label {
  flex: 1;
  min-width: 0;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear {
  flex: none;

  width: 40px;
  height: 40px;

  border: none;
  border-radius: 10px;

  background: transparent;
  color: inherit;

  font-size: 1rem;

  cursor: pointer;
}

.suggestions {
  margin: 0;
  padding: 0;

  border: 1px solid var(--border);
  border-radius: 12px;

  background: var(--surface);

  list-style: none;

  overflow: hidden;
}

.suggestions li + li {
  border-top: 1px solid var(--border);
}

.suggestion {
  display: block;

  width: 100%;
  min-height: 44px;
  padding: 0 12px;

  border: none;

  background: transparent;
  color: inherit;

  font: inherit;
  text-align: left;

  cursor: pointer;
}

.suggestion.new {
  color: var(--primary);
  font-weight: 600;
}
</style>
