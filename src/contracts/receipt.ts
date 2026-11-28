import {
  asNumber,
  asObject,
  asString,
  ContractError,
} from "@/contracts/read";

/* =========================
   Lecture d'un ticket de caisse : POST /api/receipt/read

   Contrat : contracts/MULTI_ENV_CONTRACT.md, §5.3 (1.9.0),
   capacité receiptRead. Corps : l'image JPEG brute, 3 Mo au
   plus. Réponse { receipt: { … } } : tous les champs toujours
   présents, null si illisible ou hors format. Rien n'est
   gardé par le proxy ; le résultat ne fait que préremplir le
   formulaire, Michel confirme toujours.

   Les formats sont contrôlés une seconde fois ici : une
   valeur hors format devient null, jamais une erreur.
========================= */

export const RECEIPT_PATH = "/api/receipt/read";

export const RECEIPT_MAX_BYTES = 3 * 1024 * 1024;

export type ReceiptPaymentMethod = "card" | "cash" | "twint" | "other";

export interface ReceiptReading {
  /* AAAA-MM-JJ */
  date: string | null;

  /* HH:MM */
  time: string | null;

  amount: number | null;
  currency: string | null;
  paymentMethod: ReceiptPaymentMethod | null;

  /* 4 derniers chiffres de la carte. */
  cardDigits: string | null;

  /* Tel qu'imprimé (raison sociale, localité). */
  merchant: string | null;

  /* Nom usuel du magasin ou de la marque. */
  merchantBrand: string | null;
}

function matching(
  value: unknown,
  pattern: RegExp
): string | null {
  const text =
    asString(value).trim();

  return pattern.test(text)
    ? text
    : null;
}

function readText(
  value: unknown
): string | null {
  return asString(value).trim() || null;
}

function readAmount(
  value: unknown
): number | null {
  const amount =
    asNumber(value, Number.NaN);

  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : null;
}

function readPaymentMethod(
  value: unknown
): ReceiptPaymentMethod | null {
  return value === "card" || value === "cash" || value === "twint" || value === "other"
    ? value
    : null;
}

export function readReceiptReading(
  raw: unknown
): ReceiptReading {
  const receipt =
    asObject(asObject(raw)?.receipt);

  if (!receipt) {
    throw new ContractError(
      RECEIPT_PATH,
      "invalid format"
    );
  }

  return {
    date: matching(receipt.date, /^\d{4}-\d{2}-\d{2}$/),
    time: matching(receipt.time, /^\d{2}:\d{2}$/),
    amount: readAmount(receipt.amount),
    currency: matching(receipt.currency, /^[A-Z]{3}$/),
    paymentMethod: readPaymentMethod(receipt.paymentMethod),
    cardDigits: matching(receipt.cardDigits, /^\d{4}$/),
    merchant: readText(receipt.merchant),
    merchantBrand: readText(receipt.merchantBrand),
  };
}
