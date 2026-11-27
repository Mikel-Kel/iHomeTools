<script setup lang="ts">
/* =========================
   En-tête d'une période de Follow-up

   Titre de la période (mois ou année), flèches ‹ › vers les
   mois précédents et suivants dans la vue Month (navigable),
   sous-titre facultatif. BudgetView.vue décide de tout ;
   l'en-tête ne fait qu'afficher et signaler le pas demandé.
========================= */

defineProps<{
  title: string;
  subtitle: string;
  navigable: boolean;
  canPrevious: boolean;
  canNext: boolean;
}>();

const emit =
  defineEmits<{
    move: [step: number];
  }>();
</script>

<template>
  <header class="period-header">
    <div class="title-row">
      <button
        v-if="navigable"
        type="button"
        class="month-nav"
        aria-label="Previous month"
        :disabled="!canPrevious"
        @click="emit('move', -1)"
      >
        ‹
      </button>

      <h2 :class="{ centered: navigable }">
        {{ title }}
      </h2>

      <button
        v-if="navigable"
        type="button"
        class="month-nav"
        aria-label="Next month"
        :disabled="!canNext"
        @click="emit('move', 1)"
      >
        ›
      </button>
    </div>

    <p
      v-if="subtitle"
      class="subtitle"
    >
      {{ subtitle }}
    </p>
  </header>
</template>

<style scoped>
.period-header {
  margin: 0 0 4px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

h2 {
  flex: 1;
  margin: 0;

  font-size: var(--font-size-lg);
}

h2.centered {
  text-align: center;
}

.month-nav {
  flex: none;

  width: 40px;
  height: 40px;

  border: none;
  border-radius: 10px;

  background: var(--btn-secondary-bg);
  color: var(--text);

  font-size: 1.5rem;
  line-height: 1;

  cursor: pointer;
}

.month-nav:disabled {
  opacity: 0.35;

  cursor: default;
}

.subtitle {
  margin: 2px 0 0;

  color: var(--text-soft);
  font-size: var(--font-size-sm);
}
</style>
