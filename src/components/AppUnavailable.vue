<script setup lang="ts">
import { ref } from "vue";

import { CONTRACT_VERSION } from "@/contracts/environment";

import {
  environmentChecking,
  loadEnvironment,
  submitProxyKey,
} from "@/services/environment/environmentGuard";

import {
  environmentBlock,
  requiresReload,
} from "@/services/environment/environmentState";

/* =========================
   Écran « app indisponible »

   Couvre toute l'app tant que l'environnement n'est pas
   établi (environmentGuard.ts) : refus du proxy, contrat
   incompatible, environnement changé ou proxy injoignable
   (Tailscale coupé, Mac en veille). « Retry » relance
   /api/whoami, « Reload » recharge l'app. Clé du proxy
   absente ou refusée : saisie, une fois par appareil
   (« Connect »).
========================= */

function reloadApp() {
  window.location.reload();
}

const keyInput =
  ref("");

async function connect() {
  if (!keyInput.value.trim() || environmentChecking.value) {
    return;
  }

  await submitProxyKey(keyInput.value);

  keyInput.value = "";
}
</script>

<template>
  <div
    v-if="environmentBlock"
    class="unavailable"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="unavailable-title"
  >
    <section
      v-if="environmentBlock.kind === 'key'"
      class="card"
    >
      <h1 id="unavailable-title">
        {{ environmentBlock.rejected ? "Proxy key rejected" : "Proxy key required" }}
      </h1>

      <p class="message">
        {{
          environmentBlock.rejected
            ? "The home services refused this key. Enter the current proxy key."
            : "Enter the HomeTools proxy key. It is asked once on this iPhone and stored encrypted."
        }}
      </p>

      <input
        v-model="keyInput"
        class="key-input"
        type="password"
        autocomplete="off"
        aria-label="Proxy key"
        :disabled="environmentChecking"
        @keyup.enter="connect"
      >

      <button
        type="button"
        class="button primary"
        :disabled="environmentChecking || !keyInput.trim()"
        @click="connect"
      >
        {{ environmentChecking ? "Checking…" : "Connect" }}
      </button>
    </section>

    <section
      v-else
      class="card"
    >
      <template v-if="environmentBlock.kind === 'unreachable'">
        <h1 id="unavailable-title">Home services unreachable</h1>

        <p class="message">
          The server does not answer. Check that Tailscale is on, and that the Mac is on and connected.
        </p>
      </template>

      <template v-else-if="environmentBlock.kind === 'error'">
        <h1 id="unavailable-title">iHomeTools is not available</h1>

        <p
          v-if="environmentBlock.message"
          class="message"
        >
          {{ environmentBlock.message }}
        </p>

        <p
          v-if="environmentBlock.code"
          class="code"
        >
          {{ environmentBlock.code }}
        </p>
      </template>

      <template v-else-if="environmentBlock.kind === 'contract'">
        <h1 id="unavailable-title">Incompatible version</h1>

        <p class="message">
          This app follows contract {{ CONTRACT_VERSION }}; the home services follow
          contract {{ environmentBlock.proxyVersion || "(unknown)" }}.
          Reload to get the matching version of the app.
        </p>
      </template>

      <template v-else-if="environmentBlock.kind === 'changed'">
        <h1 id="unavailable-title">Environment changed</h1>

        <p class="message">
          This iPhone now belongs to environment {{ environmentBlock.received }}
          instead of {{ environmentBlock.expected }}. Reload to continue.
        </p>
      </template>

      <p
        v-if="!requiresReload(environmentBlock)"
        class="detail"
      >
        The app checks again every minute.
      </p>

      <button
        v-if="requiresReload(environmentBlock)"
        type="button"
        class="button primary"
        @click="reloadApp"
      >
        Reload
      </button>

      <button
        v-else
        type="button"
        class="button primary"
        :disabled="environmentChecking"
        @click="loadEnvironment"
      >
        {{ environmentChecking ? "Checking…" : "Retry" }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.unavailable {
  position: fixed;
  inset: 0;
  z-index: 3000;

  display: flex;
  align-items: center;
  justify-content: center;

  padding: calc(var(--safe-top) + var(--gutter)) var(--gutter) calc(var(--safe-bottom) + var(--gutter));

  background: var(--bg);
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;

  width: 100%;
  max-width: 420px;
  padding: 28px 20px;

  border: 1px solid var(--border);
  border-radius: 16px;

  background: var(--surface);
  box-shadow: var(--shadow-lg);

  text-align: center;
}

.card h1 {
  margin: 0;

  font-size: var(--font-size-lg);
}

.message {
  margin: 0;

  white-space: pre-wrap;
}

.key-input {
  width: 100%;
}

.code {
  margin: 0;

  color: var(--text-soft);
  font-family: ui-monospace, Menlo, monospace;
  font-size: var(--font-size-sm);
}

.detail {
  margin: 0;

  color: var(--text-soft);
  font-size: var(--font-size-sm);
}
</style>
