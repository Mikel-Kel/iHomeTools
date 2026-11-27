import {
  ref,
  watch,
} from "vue";

import {
  asBoolean,
  asNumber,
  asObject,
  asString,
  type JsonObject,
} from "@/contracts/read";

import {
  MOBILE_EXPENSE_CANCEL_SUFFIX,
  MOBILE_EXPENSE_EVENT_TRIGRAM,
  MOBILE_EXPENSE_EVENT_VERSION,
  type MobileData,
  type MobileExpenseCancel,
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

import {
  onMobileData,
  refreshMobileData,
  reloadMobileData,
} from "@/services/mobile/mobileData";

import {
  readDataJson,
  writeDataJson,
} from "@/services/storage/dataStore";

import { maintenance } from "@/services/appStatus/appStatusGuard";

import { log } from "@/utils/logger";

/* =========================
   File d'attente des saisies

   Une création, une modification ou une annulation est
   d'abord rangée sur l'iPhone (ht:<envId>:mex.queue), puis
   envoyée dès que le proxy répond (contrat
   ../Backend/docs/mobile-expense-contract.md, § 4) :
   1. events/PWA-MEX_<AAAAMMJJHHMMSS>_<id>[_DEL].json,
      MOBILE_EXPENSE_SAVED ou MOBILE_EXPENSE_CANCELLED ; le
      nom est fixé au premier essai et réutilisé, un nouvel
      essai remplace le même fichier ;
   2. events/control/<eventId>.json, STORAGE_PULL_REQUESTED
      version 2, pour que le Mac rapatrie l'événement.

   Un seul élément par saisie : la dernière version voulue
   (action save ou cancel), avec un clientUpdatedAt toujours
   plus récent que la précédente ; le Mac ignore une version
   plus ancienne. Une version pas encore écrite remplace le
   même fichier ; une version déjà partie, ou refusée, en
   écrit un nouveau. Pendant l'étape written (quelques
   secondes), la saisie ne peut pas changer : son événement
   resterait sinon sans demande de rapatriement.

   Étapes : queued (sur l'iPhone), written (événement écrit,
   demande de rapatriement à envoyer), sent (les deux écrits),
   rejected (refus du Mac lu dans events/status/, message
   affiché tel quel).

   Un élément envoyé quitte la file quand mobile.json publie
   la saisie avec un clientUpdatedAt au moins aussi récent :
   le Mac l'a reçu. Une annulation la quitte aussi sur le
   statut de succès (saisie inconnue du Mac). Un envoi répété
   est sans effet côté Mac.

   Maintenance annoncée (appStatusGuard.ts) : rien ne part,
   les saisies restent sur l'iPhone ; envoi dès sa fin.

   Envoi après chaque changement, quand l'environnement est
   établi, au retour au premier plan, au retour du réseau et
   toutes les minutes tant que la file n'est pas vide.
========================= */

const QUEUE_NAME = "mex.queue";

const RETRY_INTERVAL_MS =
  60 * 1000;

const EVENTS_FOLDER = "events";

const CONTROL_FOLDER = "events/control";

const STATUS_FOLDER = "events/status";

export type QueueAction =
  | "save"
  | "cancel";

export type QueueStep =
  | "queued"
  | "written"
  | "sent"
  | "rejected";

/* Résultat d'un changement : rangé sur l'iPhone, gardé en mémoire seulement, ou refusé (envoi en cours). */
export type QueueChange =
  | "kept"
  | "notKept"
  | "busy";

/* Valeurs saisies d'une dépense (formulaire) : sans identifiant ni horodatages. */
export type ExpenseValues =
  Omit<MobileExpenseSave, "id" | "paidAt" | "clientUpdatedAt">;

export interface QueuedExpense {
  action: QueueAction;

  /* Saisie complète, aussi pour une annulation (affichage). */
  expense: MobileExpenseSave;

  step: QueueStep;

  /* Nom de l'événement, fixé au premier essai. */
  fileName: string | null;

  /* Le Mac peut déjà connaître la saisie (une version est partie, ou elle vient de mobile.json). */
  known: boolean;

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

/* Élément rangé avant les modifications : save, connu du Mac s'il a déjà été écrit. */
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

      const step =
        readStep(item.step);

      const fileName =
        asString(item.fileName) || null;

      return [{
        action: item.action === "cancel" ? "cancel" : "save",
        expense: readExpense(expense),
        step,
        fileName,
        known: asBoolean(item.known) || step !== "queued" || fileName !== null,
        message: asString(item.message),
      }];
    });
}

function persist(): boolean {
  const saved =
    writeStored(QUEUE_NAME, queue.value);

  if (!saved) {
    log.warn("[Queue] not saved on this iPhone");
  }

  return saved;
}

/* Même version d'une saisie : changée depuis, l'élément n'est plus celui que l'envoi traite. */
function sameVersion(
  a: QueuedExpense,
  b: QueuedExpense
): boolean {
  return (
    a.expense.id === b.expense.id &&
    a.action === b.action &&
    a.expense.clientUpdatedAt === b.expense.clientUpdatedAt
  );
}

function update(
  target: QueuedExpense,
  change: Partial<QueuedExpense>
) {
  queue.value =
    queue.value.map(item =>
      sameVersion(item, target)
        ? { ...item, ...change }
        : item
    );

  persist();
}

function remove(
  target: QueuedExpense
) {
  queue.value =
    queue.value.filter(item => !sameVersion(item, target));

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
  item: QueuedExpense
): string {
  const suffix =
    item.action === "cancel"
      ? MOBILE_EXPENSE_CANCEL_SUFFIX
      : "";

  return `PWA-${MOBILE_EXPENSE_EVENT_TRIGRAM}_${fileStamp(new Date())}_${item.expense.id}${suffix}.json`;
}

async function writeEvent(
  item: QueuedExpense,
  fileName: string
) {
  const cancel: MobileExpenseCancel = {
    id: item.expense.id,
    clientUpdatedAt: item.expense.clientUpdatedAt,
  };

  await writeDataJson(
    `${EVENTS_FOLDER}/${fileName}`,
    {
      eventType: item.action === "cancel"
        ? "MOBILE_EXPENSE_CANCELLED"
        : "MOBILE_EXPENSE_SAVED",
      version: MOBILE_EXPENSE_EVENT_VERSION,
      timestamp: new Date().toISOString(),
      payload: {
        ...(item.action === "cancel" ? cancel : item.expense),
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

/* Statut du Mac : refus définitif ; succès d'une annulation, qui quitte la file. */
async function checkStatus(
  item: QueuedExpense
) {
  if (!item.fileName) {
    return;
  }

  const status =
    asObject(await readDataJson(`${STATUS_FOLDER}/${item.fileName}`));

  if (status?.status === "error") {
    update(item, {
      step: "rejected",
      message: asString(status.message, "Rejected"),
    });

    /* Cartes ou sous-catégories peut-être changées entre-temps (contrat § 4.3). */
    void refreshMobileData();
  } else if (status?.status === "success" && item.action === "cancel") {
    remove(item);
  } else if (status?.status === "success") {
    /* Le Mac vient de republier mobile.json : la saisie quitte la file à sa lecture. */
    void reloadMobileData();
  }
}

/* =========================
   Envoi
========================= */

export async function flushQueue() {
  if (sending.value || !environmentEstablished() || maintenance.value) {
    return;
  }

  sending.value = true;

  try {
    for (const item of [...queue.value]) {
      if (item.step === "queued" || item.step === "written") {
        const fileName =
          item.fileName ?? eventFileName(item);

        if (item.step === "queued") {
          if (!item.fileName) {
            update(item, { fileName });
          }

          await writeEvent(item, fileName);
          update(item, { step: "written", known: true });
        }

        await writePullRequest(fileName);
        update(item, { step: "sent" });

      } else if (item.step === "sent") {
        await checkStatus(item);
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

function queuedItem(
  id: string
): QueuedExpense | undefined {
  return queue.value.find(item => item.expense.id === id);
}

/* Événement écrit, demande de rapatriement pas encore envoyée : la saisie attend. */
export function isSending(
  id: string
): boolean {
  return queuedItem(id)?.step === "written";
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

/* Maintenant, et toujours après la version précédente. */
function nextUpdatedAt(
  previous: string
): string {
  const last =
    utcTime(previous);

  return new Date(
    Number.isNaN(last)
      ? Date.now()
      : Math.max(Date.now(), last + 1)
  ).toISOString();
}

/* Remplace l'élément de la saisie, ou l'ajoute en tête. */
function replace(
  item: QueuedExpense
): boolean {
  const exists =
    queue.value.some(current => current.expense.id === item.expense.id);

  queue.value =
    exists
      ? queue.value.map(current => (current.expense.id === item.expense.id ? item : current))
      : [item, ...queue.value];

  const saved =
    persist();

  void flushQueue();

  return saved;
}

export function addExpense(
  expense: Omit<MobileExpenseSave, "id" | "clientUpdatedAt">
): boolean {
  return replace({
    action: "save",
    expense: {
      ...expense,
      id: crypto.randomUUID(),
      clientUpdatedAt: new Date().toISOString(),
    },
    step: "queued",
    fileName: null,
    known: false,
    message: "",
  });
}

/*
  Modification : expense est la version affichée (file ou
  mobile.json), avec ses nouvelles valeurs. Les règles de
  l'état (saisie liée, allouée) sont appliquées par l'écran
  et par le Mac.
*/
export function updateExpense(
  expense: MobileExpenseSave
): QueueChange {
  if (isSending(expense.id)) {
    return "busy";
  }

  const current =
    queuedItem(expense.id);

  /* Version pas encore écrite : même fichier, réécrit. */
  const rewrite =
    current?.action === "save" && current.step === "queued";

  return replace({
    action: "save",
    expense: {
      ...expense,
      clientUpdatedAt: nextUpdatedAt(current?.expense.clientUpdatedAt ?? expense.clientUpdatedAt),
    },
    step: "queued",
    fileName: rewrite ? current.fileName : null,
    known: current ? current.known : true,
    message: "",
  })
    ? "kept"
    : "notKept";
}

/* Annulation ; une saisie jamais partie de l'iPhone est simplement retirée de la file. */
export function cancelExpense(
  expense: MobileExpenseSave
): QueueChange {
  if (isSending(expense.id)) {
    return "busy";
  }

  const current =
    queuedItem(expense.id);

  if (current && !current.known && current.step === "queued" && current.fileName === null) {
    remove(current);
    return "kept";
  }

  return replace({
    action: "cancel",
    expense: {
      ...expense,
      clientUpdatedAt: nextUpdatedAt(current?.expense.clientUpdatedAt ?? expense.clientUpdatedAt),
    },
    step: "queued",
    fileName: null,
    known: true,
    message: "",
  })
    ? "kept"
    : "notKept";
}

/* Élément refusé, abandonné par Michel : le Mac garde sa version. */
export function discardExpense(
  id: string
) {
  queue.value =
    queue.value.filter(item => item.expense.id !== id);

  persist();
}

/* Éléments reçus par le Mac : saisie publiée avec un clientUpdatedAt au moins aussi récent. */
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

  watch(
    maintenance,

    current => {
      if (!current) {
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
