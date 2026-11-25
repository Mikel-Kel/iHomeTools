<script setup lang="ts">
import { computed } from "vue";

/* =========================
   Barre réel / budget (onglet Budget)

   Affichage seul, montants du Mac (mobile.json, contrat § 6) :
   échelle = le plus grand du budget, du réel suivi du non
   confirmé, et du repère. Dans l'ordre : réel (plein), puis
   non confirmé (hachuré) ; ce qui passe le budget en rouge.
   Repère facultatif (trait vertical) : budget à date de la
   vue année. Sans budget : barre neutre, sans rouge.

   La barre est décorative (aria-hidden) : les montants sont
   écrits à côté par l'écran.
========================= */

const props =
  withDefaults(
    defineProps<{
      actual: number;
      pending: number;
      budget: number;
      marker?: number | null;
    }>(),
    {
      marker: null,
    }
  );

interface Segment {
  kind: "actual" | "pending";
  over: boolean;
  start: number;
  end: number;
}

/* Remboursements plus forts que les dépenses : rien à dessiner sous zéro. */
const actual =
  computed(() => Math.max(props.actual, 0));

const pending =
  computed(() => Math.max(props.pending, 0));

const hasBudget =
  computed(() => props.budget > 0);

const scale =
  computed(() =>
    Math.max(
      props.budget,
      actual.value + pending.value,
      props.marker ?? 0
    )
  );

/* Parts en montants ; sans budget, tout est « dans le budget » (neutre). */
const segments =
  computed<Segment[]>(() => {
    const limit =
      hasBudget.value
        ? props.budget
        : Infinity;

    const end =
      actual.value + pending.value;

    const parts: Segment[] = [
      { kind: "actual", over: false, start: 0, end: Math.min(actual.value, limit) },
      { kind: "actual", over: true, start: limit, end: actual.value },
      { kind: "pending", over: false, start: actual.value, end: Math.min(end, limit) },
      { kind: "pending", over: true, start: Math.max(actual.value, limit), end },
    ];

    return parts.filter(part => part.end > part.start);
  });

function percent(
  value: number
): string {
  return `${(value / scale.value) * 100}%`;
}

const markerLeft =
  computed(() =>
    props.marker !== null && props.marker > 0 && scale.value > 0
      ? percent(props.marker)
      : null
  );
</script>

<template>
  <div
    class="bar"
    :class="{ neutral: !hasBudget }"
    aria-hidden="true"
  >
    <template v-if="scale > 0">
      <span
        v-for="segment in segments"
        :key="`${segment.kind}-${segment.over}`"
        class="segment"
        :class="[segment.kind, { over: segment.over }]"
        :style="{ left: percent(segment.start), width: percent(segment.end - segment.start) }"
      />

      <span
        v-if="markerLeft"
        class="marker"
        :style="{ left: markerLeft }"
      />
    </template>
  </div>
</template>

<style scoped>
.bar {
  --bar-color: var(--primary);

  position: relative;

  height: 12px;
  overflow: hidden;

  border-radius: 6px;

  background: var(--surface-soft);
  box-shadow: inset 0 0 0 1px var(--border);
}

.bar.neutral {
  --bar-color: var(--text-muted);
}

.segment {
  position: absolute;
  top: 0;
  bottom: 0;

  --segment-color: var(--bar-color);
}

.segment.over {
  --segment-color: var(--negative);
}

.segment.actual {
  background: var(--segment-color);
}

.segment.pending {
  background:
    repeating-linear-gradient(
      -45deg,
      var(--segment-color) 0 3px,
      transparent 3px 6px
    );

  box-shadow: inset 0 0 0 1px var(--segment-color);
}

.marker {
  position: absolute;
  top: -1px;
  bottom: -1px;

  width: 2px;
  margin-left: -1px;

  background: var(--text);
}
</style>
