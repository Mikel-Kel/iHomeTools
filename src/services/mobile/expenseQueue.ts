import {
  ref,
  watch,
} from "vue";

import {
  asNumber,
  asObject,
  asString,
  type JsonObject,
} from "@/contracts/read";

import {
  MOBILE_EXPENSE_EVENT_TRIGRAM,
  MOBILE_EXPENSE_EVENT_VERSION,
  type MobileData,
  type MobileExpenseSave,
} from "@/contracts/mobile";

import {
  readStored,
  writeStored,
} from "@/services/environment/browserStorage";

import {
  deviceName,
  environment,
  environmentEstablished,
  storedEnvId,
} from "@/services/environment/environmentState";

import { onMobileData } from "@/services/mobile/mobileData";

import {
  readDataJson,
  writeDataJson,
} from "@/services/storage/dataStore";

import { log } from "@/utils/logger";

/* =========================
   File d'attente des saisies

   Une saisie est d'abord rangée sur l'iPhone
   (ht:<envId>:mex.queue), puis envoyée dès que le proxy
   répond (contrat ../Backend/docs/mobile-expense-contract.md,
   § 4) :
   1. events/PWA-MEX_<AAAAMMJJHHMMSS>_<id>.json,
      MOBILE_EXPENSE_SAVED ; le nom est fixé au premier essai
      et réutilisé, un nouvel essai remplace le même fichier ;
   2. events/control/<eventId>.json, STORAGE_PULL_REQUESTED
      version 2, pour que le Mac rapatrie l'événement.

   Étapes : queued (sur l'iPhone), written (événement écrit,
   demande de rapatriement à envoyer), sent (les deux écrits),
   rejected (refus du Mac lu dans events/status/, message
   affiché tel quel).

   Une saisie envoyée quitte la file quand mobile.json la
   publie avec un clientUpdatedAt au moins aussi récent : le
   Mac l'a reçue. Un envoi répété est sans effet côté Mac.

   Envoi après chaque saisie, quand l'environnement est
   établi, au retour au premier plan, au retour du réseau et
   toutes les minutes tant que la file n'est pas vide.
========================= */

const QUEUE_NAME = "mex.queue";

const RETRY_INTERVAL_MS =
  60 * 1000;

const EVENTS_FOLDER = "events";

const CONTROL_FOLDER = "events/control";

const STATUS_FOLDER = "events/status";

export type QueueStep =
  | "queued"
  | "written"
  | "sent"
  | "rejected";

export interface QueuedExpense {
  expense: MobileExpenseSave;
  step: QueueStep;

  /* Nom de l'événement, fixé au premier essai. */
  fileName: string | null;

  /* Refus du Mac. */
  message: string;
}

export const queue =
  ref<QueuedExpense[]>([]);

export const sending =
  ref(false);

/* Dernier échec d'envoi (réseau, proxy) ; vide après un envoi réussi. */
export const sendError =
  ref("");

/* =========================
   Persistance
========================= */

function readExpense(
  value: JsonObject
): MobileExpenseSave {
  return {
    id: asString(value.id),
    paidAt: asString(value.paidAt),
    cardId: asNumber(value.cardId),
    amount: asNumber(value.amount),
    currency: asString(value.currency),
    subCategoryId: asNumber(value.subCategoryId),
    comment: asString(value.comment),
    clientUpdatedAt: asString(value.clientUpdatedAt),
  };
}

function readStep(
  value: unknown
): QueueStep {
  return value === "written" || value === "sent" || value === "rejected"
    ? value
    : "queued";
}

function readQueue(
  raw: unknown
): QueuedExpense[] {
  return (Array.isArray(raw) ? raw : [])
    .map(asObject)
    .flatMap(item => {
      const expense =
        asObject(item?.expense);

      if (!item || !expense || !asString(expense.id)) {
        return [];
      }

      return [{
        expense: readExpense(expense),
        step: readStep(item.step),
        fileName: asString(item.fileName) || null,
        message: asString(item.message),
      }];
    });
}

function persist() {
  if (!writeStored(QUEUE_NAME, queue.value)) {
    log.warn("[Queue] not saved on this iPhone");
  }
}

function update(
  id: string,
  change: Partial<QueuedExpense>
) {
  queue.value =
    queue.value.map(item =>
      item.expense.id === id
        ? { ...item, ...change }
        : item
    );

  persist();
}

/* =========================
   Événements
========================= */

function pad(
  value: number
): string {
  return String(value).padStart(2, "0");
}

/* Heure locale, AAAAMMJJHHMMSS (nom des événements de la PWA). */
function fileStamp(
  date: Date
): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/* Heure locale de l'iPhone, AAAA-MM-JJTHH:MM:SS (paidAt). */
export function localDateTime(
  date: Date
): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function eventFileName(
  id: string
): string {
  return `PWA-${MOBILE_EXPENSE_EVENT_TRIGRAM}_${fileStamp(new Date())}_${id}.json`;
}

async function writeEvent(
  item: QueuedExpense,
  fileName: string
) {
  await writeDataJson(
    `${EVENTS_FOLDER}/${fileName}`,
    {
      eventType: "MOBILE_EXPENSE_SAVED",
      version: MOBILE_EXPENSE_EVENT_VERSION,
      timestamp: new Date().toISOString(),
      payload: {
        ...item.expense,
        source: deviceName(),
      },
    }
  );
}

/* Demande de rapatriement, même forme que celle de la PWA (version 2). */
async function writePullRequest(
  fileName: string
) {
  const now =
    new Date();

  const eventId =
    `PWA-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}` +
    `-iphone-${crypto.randomUUID()}`;

  const path =
    `${EVENTS_FOLDER}/${fileName}`;

  await writeDataJson(
    `${CONTROL_FOLDER}/${eventId}.json`,
    {
      eventId,
      type: "STORAGE_PULL_REQUESTED",
      typeVersion: 2,
      source: "iphone",
      createdAt: now.toISOString(),
      schemaVersion: 2,
      payload: {
        downloadPaths: [path],
        deletePaths: [],
        paths: [path],
        reason: "Mobile expense",
      },
    }
  );
}

/* Refus définitif du Mac : statut error de l'événement. */
async function checkRejection(
  item: QueuedExpense
) {
  if (!item.fileName) {
    return;
  }

  const status =
    asObject(await readDataJson(`${STATUS_FOLDER}/${item.fileName}`));

  if (status?.status === "error") {
    update(item.expense.id, {
      step: "rejected",
      message: asString(status.message, "Rejected"),
    });
  }
}

/* =========================
   Envoi
========================= */

export async function flushQueue() {
  if (sending.value || !environmentEstablished()) {
    return;
  }

  sending.value = true;

  try {
    for (const item of [...queue.value]) {
      const id =
        item.expense.id;

      if (item.step === "queued" || item.step === "written") {
        const fileName =
          item.fileName ?? eventFileName(id);

        if (item.step === "queued") {
          if (!item.fileName) {
            update(id, { fileName });
          }

          await writeEvent(item, fileName);
          update(id, { step: "written" });
        }

        await writePullRequest(fileName);
        update(id, { step: "sent" });

      } else if (item.step === "sent") {
        await checkRejection(item);
      }
    }

    sendError.value = "";

  } catch (err) {
    sendError.value =
      err instanceof Error
        ? err.message
        : String(err);

    log.warn("[Queue] sending failed", err);

  } finally {
    sending.value = false;
  }
}

/* =========================
   Saisies
========================= */

export function addExpense(
  expense: Omit<MobileExpenseSave, "id" | "clientUpdatedAt">
): boolean {
  const item: QueuedExpense = {
    expense: {
      ...expense,
      id: crypto.randomUUID(),
      clientUpdatedAt: new Date().toISOString(),
    },
    step: "queued",
    fileName: null,
    message: "",
  };

  queue.value =
    [item, ...queue.value];

  const saved =
    writeStored(QUEUE_NAME, queue.value);

  void flushQueue();

  return saved;
}

/* Saisie refusée, abandonnée par Michel. */
export function discardExpense(
  id: string
) {
  queue.value =
    queue.value.filter(item => item.expense.id !== id);

  persist();
}

/* Horodatage UTC (contrat § 3.1), avec ou sans « Z » ; NaN si illisible. */
function utcTime(
  value: string
): number {
  return Date.parse(
    /(Z|[+-]\d{2}:?\d{2})$/.test(value)
      ? value
      : `${value}Z`
  );
}

/* Saisies reçues par le Mac : publiées avec un clientUpdatedAt au moins aussi récent. */
function removeReceived(
  data: MobileData
) {
  const published =
    new Map(
      data.entries.map(entry => [entry.id, utcTime(entry.clientUpdatedAt)])
    );

  const remaining =
    queue.value.filter(item => {
      const publishedAt =
        published.get(item.expense.id);

      return (
        item.step === "rejected" ||
        publishedAt === undefined ||
        publishedAt < utcTime(item.expense.clientUpdatedAt)
      );
    });

  if (remaining.length !== queue.value.length) {
    queue.value = remaining;
    persist();
  }
}

/* Posé une fois au démarrage (main.ts). */
export function startExpenseQueue() {
  watch(
    storedEnvId,

    env => {
      if (env && !queue.value.length) {
        queue.value =
          readStored(QUEUE_NAME, readQueue) ?? [];
      }
    },

    {
      immediate: true,
    }
  );

  watch(
    environment,

    (current, previous) => {
      if (current && !previous) {
        void flushQueue();
      }
    }
  );

  onMobileData(removeReceived);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void flushQueue();
    }
  });

  window.addEventListener("online", () => {
    void flushQueue();
  });

  window.setInterval(() => {
    if (queue.value.some(item => item.step !== "rejected")) {
      void flushQueue();
    }
  }, RETRY_INTERVAL_MS);
}
