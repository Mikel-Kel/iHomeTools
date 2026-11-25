<script setup lang="ts">
/* =========================
   Pastille d'état (même rôle que celle de HomeTools)
========================= */

export type StatusTone =
  | "neutral"
  | "primary"
  | "positive"
  | "warning"
  | "negative";

withDefaults(
  defineProps<{
    tone?: StatusTone;
  }>(),
  {
    tone: "neutral",
  }
);
</script>

<template>
  <span
    class="pill"
    :class="tone"
  >
    <slot />
  </span>
</template>

<style scoped>
.pill {
  display: inline-block;

  padding: 1px 8px;

  border: 1px solid currentColor;
  border-radius: 999px;

  font-size: var(--font-size-xs);
  font-weight: 600;
  white-space: nowrap;
}

.neutral {
  color: var(--text-soft);
}

.primary {
  color: var(--primary);
}

.positive {
  color: var(--positive);
}

.warning {
  color: var(--warning);
}

.negative {
  color: var(--negative);
}
</style>
