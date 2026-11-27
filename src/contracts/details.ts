import {
  asArray,
  asNumber,
  asObject,
  asString,
  ContractError,
  type JsonObject,
} from "@/contracts/read";

/* =========================
   Export mobile/details.json

   Contrat : ../Backend/docs/mobile-expense-contract.md, § 5.1
   (v0.12). Détail des montants de Follow-up : une ligne par
   élément d'un montant publié au § 6, pour toutes les
   sous-catégories de mobile.json (fichier commun à
   l'environnement), sur les 12 mois glissants.

   actual : allocation d'un mouvement (sous-catégorie suivie),
   month = mois de rattachement ; pending : saisie pas encore
   confirmée ; recorded : saisie hors suivi.
   Lignes déjà triées par le Mac (date décroissante, saisies
   avant allocations le même jour) : l'iPhone ne retrie pas,
   n'additionne rien et ne contrôle rien.
========================= */

export const DETAILS_FOLDER = "mobile";

export const DETAILS_FILE = "details.json";

export type DetailKind = "actual" | "pending" | "recorded";

export interface DetailLine {
  subCategoryId: number;

  /* AAAA-MM : mois de rattachement (actual) ou du paiement. */
  month: string;

  /* AAAA-MM-JJ : date valeur du mouvement ou du paiement. */
  date: string;

  kind: DetailKind;
  comment: string | null;
  bankText: string | null;
  partyLabel: string | null;

  /* CHF, avec son signe (négatif pour un remboursement). */
  amount: number;

  expenseId: string | null;
}

export interface MobileDetails {
  generatedAt: string;
  months: string[];
  lines: DetailLine[];
}

function readKind(
  value: unknown
): DetailKind | null {
  return value === "actual" || value === "pending" || value === "recorded"
    ? value
    : null;
}

/* Texte non vide, sinon null. */
function readText(
  value: unknown
): string | null {
  return asString(value).trim() || null;
}

function readLine(
  line: JsonObject
): DetailLine | null {
  const kind =
    readKind(line.kind);

  const month =
    asString(line.month);

  if (!kind || !/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  return {
    subCategoryId: asNumber(line.subCategoryId, Number.NaN),
    month,
    date: asString(line.date),
    kind,
    comment: readText(line.comment),
    bankText: readText(line.bankText),
    partyLabel: readText(line.partyLabel),
    amount: asNumber(line.amount),
    expenseId: readText(line.expenseId),
  };
}

export function readMobileDetails(
  raw: unknown
): MobileDetails {
  const file =
    asObject(raw);

  if (
    !file ||
    asNumber(file.version) !== 1 ||
    !Array.isArray(file.lines)
  ) {
    throw new ContractError(
      DETAILS_FILE,
      "invalid format"
    );
  }

  return {
    generatedAt: asString(file.generatedAt),

    months: asArray(file.months)
      .filter((month): month is string => typeof month === "string" && /^\d{4}-\d{2}$/.test(month)),

    lines: asArray(file.lines)
      .map(asObject)
      .filter((line): line is JsonObject => line !== null)
      .map(readLine)
      .filter((line): line is DetailLine => line !== null && Number.isFinite(line.subCategoryId)),
  };
}
