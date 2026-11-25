<script setup lang="ts">
import AppUnavailable from "@/components/AppUnavailable.vue";
import HomeView from "@/views/HomeView.vue";

import {
  environment,
  environmentBlock,
} from "@/services/environment/environmentState";

/*
  Les écrans ne sont montés qu'une fois l'environnement
  connu (/api/whoami) : aucun ne lit le stockage avant.
*/
</script>

<template>
  <HomeView v-if="environment" />

  <p
    v-else-if="!environmentBlock"
    class="connecting"
  >
    Connecting…
  </p>

  <AppUnavailable />
</template>

<style scoped>
.connecting {
  margin: 0;
  padding: calc(var(--safe-top) + 2rem) var(--gutter) 2rem;

  color: var(--text-soft);
  text-align: center;
}
</style>
