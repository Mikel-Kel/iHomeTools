import {
  asArray,
  asBoolean,
  asNullableNumber,
  asNumber,
  asObject,
  asString,
  ContractError,
  type JsonObject,
} from "@/contracts/read";

/* =========================
   Export mobile/mobile.json

   Contrat : ../Backend/docs/mobile-expense-contract.md, § 5
   et § 6 (capacité mobileExpense). Publié par le Mac, lu au
   lancement et au retour au premier plan.

   Montants du réel et du budget en CHF, positifs pour une
   dépense ; l'app n'additionne rien.
     month : budget, actual, pending (mois courant) ;
     year  : budget, budgetToDate (janvier au mois courant
             compris), actual, pending.
   pending : saisies iPhone non annulées dont le mouvement
   n'est pas libéré (« non confirmé »).
========================= */

export const MOBILE_FOLDER = "mobile";

export const MOBILE_FILE = "mobile.json";

export type CardKind = "credit" | "debit";

export type EntryState = "open" | "linked" | "cancelled";

export interface PaymentMean {
  cardId: number;
  label: string;
  holder: string;
  kind: CardKind;

  /* Devise proposée par défaut (carte, sinon compte). */
  currency: string;
}

export interface MonthFigures {
  budget: number;
  actual: number;
  pending: number;
}

export interface YearFigures {
  budget: number;
  budgetToDate: number;
  actual: number;
  pending: number;
}

export interface MobileSubCategory {
  subCategoryId: number;
  label: string;
  categoryId: number;
  categoryLabel: string;
  nature: string;
  order: number;
  month: MonthFigures;
  year: YearFigures;
}

export interface LinkedMovement {
  date: string;
  text: string;
  amountChf: number;
}

export interface MobileEntry {
  id: string;
  paidAt: string;
  cardId: number;
  amount: number;
  currency: string;
  amountChf: number | null;
  subCategoryId: number;
  comment: string;
  state: EntryState;
  allocated: boolean;
  clientUpdatedAt: string;
  movement: LinkedMovement | null;
}

export interface MobileWarning {
  code: string;
  id: string;
}

export interface MobileData {
  generatedAt: string;

  /* Date du jour du Mac (AAAA-MM-JJ) : mois et année des montants. */
  today: string;

  paymentMeans: PaymentMean[];
  subCategories: MobileSubCategory[];
  entries: MobileEntry[];
  warnings: MobileWarning[];
}

function objects(
  value: unknown
): JsonObject[] {
  return asArray(value)
    .map(asObject)
    .filter(
      (item): item is JsonObject =>
        item !== null
    );
}

function readState(
  value: unknown
): EntryState {
  return value === "linked" || value === "cancelled"
    ? value
    : "open";
}

function readMovement(
  value: unknown
): LinkedMovement | null {
  const movement =
    asObject(value);

  return movement
    ? {
        date: asString(movement.date),
        text: asString(movement.text),
        amountChf: asNumber(movement.amountChf),
      }
    : null;
}

export function readMobileData(
  raw: unknown
): MobileData {
  const file =
    asObject(raw);

  if (
    !file ||
    asNumber(file.version) !== 1 ||
    !Array.isArray(file.subCategories)
  ) {
    throw new ContractError(
      MOBILE_FILE,
      "invalid format"
    );
  }

  return {
    generatedAt: asString(file.generatedAt),
    today: asString(file.today),

    paymentMeans: objects(file.paymentMeans)
      .map(mean => ({
        cardId: asNumber(mean.cardId),
        label: asString(mean.label),
        holder: asString(mean.holder),
        kind: (mean.kind === "credit" ? "credit" : "debit") as CardKind,
        currency: asString(mean.currency, "CHF"),
      })),

    subCategories: objects(file.subCategories)
      .map(sub => {
        const month =
          asObject(sub.month);

        const year =
          asObject(sub.year);

        return {
          subCategoryId: asNumber(sub.subCategoryId),
          label: asString(sub.label),
          categoryId: asNumber(sub.categoryId),
          categoryLabel: asString(sub.categoryLabel),
          nature: asString(sub.nature),
          order: asNumber(sub.order),

          month: {
            budget: asNumber(month?.budget),
            actual: asNumber(month?.actual),
            pending: asNumber(month?.pending),
          },

          year: {
            budget: asNumber(year?.budget),
            budgetToDate: asNumber(year?.budgetToDate),
            actual: asNumber(year?.actual),
            pending: asNumber(year?.pending),
          },
        };
      })
      .sort((a, b) => a.order - b.order),

    entries: objects(file.entries)
      .map(entry => ({
        id: asString(entry.id),
        paidAt: asString(entry.paidAt),
        cardId: asNumber(entry.cardId),
        amount: asNumber(entry.amount),
        currency: asString(entry.currency, "CHF"),
        amountChf: asNullableNumber(entry.amountChf),
        subCategoryId: asNumber(entry.subCategoryId),
        comment: asString(entry.comment),
        state: readState(entry.state),
        allocated: asBoolean(entry.allocated),
        clientUpdatedAt: asString(entry.clientUpdatedAt),
        movement: readMovement(entry.movement),
      }))
      .filter(entry => entry.id),

    warnings: objects(file.warnings)
      .map(warning => ({
        code: asString(warning.code),
        id: asString(warning.id),
      })),
  };
}

/* =========================
   Devises acceptées par le Mac

   CHF et celles de settings/exchangeRates.json (clés de
   rates) ; contrat § 4.3.
========================= */

export const EXCHANGE_RATES_FOLDER = "settings";

export const EXCHANGE_RATES_FILE = "exchangeRates.json";

export const BASE_CURRENCY = "CHF";

export function readExchangeCurrencies(
  raw: unknown
): string[] {
  const rates =
    asObject(asObject(raw)?.rates);

  return [
    BASE_CURRENCY,
    ...Object.keys(rates ?? {})
      .filter(code => /^[A-Z]{3}$/.test(code) && code !== BASE_CURRENCY)
      .sort(),
  ];
}

/* =========================
   Événements PWA-MEX_<AAAAMMJJHHMMSS>_<id>.json (§ 4)

   MOBILE_EXPENSE_SAVED : création ou modification ; un
   événement dont clientUpdatedAt n'est pas plus récent que
   la base ne change rien (envoi répété sans effet). Pas de
   tag. Statut dans events/status/<même nom>.
========================= */

export const MOBILE_EXPENSE_EVENT_TRIGRAM = "MEX";

export const MOBILE_EXPENSE_EVENT_VERSION = 1;

export interface MobileExpenseSave {
  id: string;

  /* Heure locale de l'iPhone, AAAA-MM-JJTHH:MM:SS. */
  paidAt: string;

  cardId: number;
  amount: number;
  currency: string;
  subCategoryId: number;
  comment: string;
  clientUpdatedAt: string;
}
