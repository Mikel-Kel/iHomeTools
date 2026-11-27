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
     months : 12 derniers mois glissants (AAAA-MM), du plus
             ancien au mois courant (égal à month) ; liste
             vide dans un fichier plus ancien (v0.5).
   pending : saisies iPhone non annulées dont le mouvement
   n'est pas libéré (« non confirmé »).

   owner (cartes et saisies) : propriétaire de la carte
   (MobileOwner, § 3.2), null s'il n'est pas choisi ; l'app
   ne montre que ceux de son appareil (§ 5). Sous-catégories
   attribuées par propriétaire (owners, § 3.3) : l'app ne
   propose et ne montre dans Budget que celles du sien.
   Libellé d'une carte unique par propriétaire seulement :
   une carte s'identifie par cardId.

   Commerçant d'une saisie (v0.9) : partyId (partie choisie)
   ou partyName (texte libre), au plus l'un des deux ;
   partyLabel : libellé actuel de partyId, null si la partie
   n'existe plus. Fichier plus ancien : pas de commerçant.

   Cartes et catégories hors suivi (v0.10, tracked: false ;
   absent = true) : dépenses personnelles sans budget ni
   liaison. Une carte hors suivi n'accepte que des
   sous-catégories hors suivi, et inversement. Saisie d'une
   carte hors suivi : état recorded, montant en CHF figé à la
   réception. untrackedTotals : totaux par propriétaire
   calculés par le Mac (year.actual = année à date) ; l'app
   n'additionne rien. kind null : carte sans compte.
========================= */

export const MOBILE_FOLDER = "mobile";

export const MOBILE_FILE = "mobile.json";

export type CardKind = "credit" | "debit";

export type EntryState = "open" | "linked" | "recorded" | "cancelled";

export interface PaymentMean {
  cardId: number;
  label: string;
  holder: string;
  owner: string | null;

  /* Couleur de la carte (#RRGGBB), null si aucune. */
  color: string | null;

  /* null : carte hors suivi sans compte. */
  kind: CardKind | null;

  /* false : carte d'un compte hors suivi. */
  tracked: boolean;

  /* Devise proposée par défaut (carte, sinon compte). */
  currency: string;
}

export interface MonthFigures {
  budget: number;
  actual: number;
  pending: number;
}

export interface MonthHistoryFigures extends MonthFigures {
  /* AAAA-MM */
  month: string;
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

  /* Propriétaires à qui elle est attribuée (§ 3.3). */
  owners: string[];

  /* false : catégorie hors suivi (sans budget). */
  tracked: boolean;

  month: MonthFigures;
  year: YearFigures;
  months: MonthHistoryFigures[];
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
  owner: string | null;
  amount: number;
  currency: string;
  amountChf: number | null;
  subCategoryId: number;
  comment: string;
  state: EntryState;
  allocated: boolean;
  clientUpdatedAt: string;
  movement: LinkedMovement | null;

  partyId: number | null;
  partyName: string | null;
  partyLabel: string | null;
}

export interface UntrackedTotals {
  owner: string;
  month: number;

  /* Année à date. */
  year: number;

  months: { month: string; actual: number }[];
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
  untrackedTotals: UntrackedTotals[];
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
  return value === "linked" || value === "recorded" || value === "cancelled"
    ? value
    : "open";
}

function readKind(
  value: unknown
): CardKind | null {
  return value === "credit" || value === "debit"
    ? value
    : null;
}

function readOwner(
  value: unknown
): string | null {
  return asString(value).trim() || null;
}

function readColor(
  value: unknown
): string | null {
  const color =
    asString(value).trim().toUpperCase();

  return /^#[0-9A-F]{6}$/.test(color)
    ? color
    : null;
}

function readOwners(
  value: unknown
): string[] {
  return asArray(value)
    .map(readOwner)
    .filter((owner): owner is string => owner !== null);
}

function readMonths(
  value: unknown
): MonthHistoryFigures[] {
  return objects(value)
    .map(item => ({
      month: asString(item.month),
      budget: asNumber(item.budget),
      actual: asNumber(item.actual),
      pending: asNumber(item.pending),
    }))
    .filter(item => /^\d{4}-\d{2}$/.test(item.month));
}

/* Texte non vide, sinon null. */
function readText(
  value: unknown
): string | null {
  const text =
    asString(value).trim();

  return text || null;
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
        owner: readOwner(mean.owner),
        color: readColor(mean.color),
        kind: readKind(mean.kind),
        currency: asString(mean.currency, "CHF"),
        tracked: mean.tracked !== false,
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
          owners: readOwners(sub.owners),
          tracked: sub.tracked !== false,

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

          months: readMonths(sub.months),
        };
      })
      .sort((a, b) => a.order - b.order),

    entries: objects(file.entries)
      .map(entry => ({
        id: asString(entry.id),
        paidAt: asString(entry.paidAt),
        cardId: asNumber(entry.cardId),
        owner: readOwner(entry.owner),
        amount: asNumber(entry.amount),
        currency: asString(entry.currency, "CHF"),
        amountChf: asNullableNumber(entry.amountChf),
        subCategoryId: asNumber(entry.subCategoryId),
        comment: asString(entry.comment),
        state: readState(entry.state),
        allocated: asBoolean(entry.allocated),
        clientUpdatedAt: asString(entry.clientUpdatedAt),
        movement: readMovement(entry.movement),
        partyId: asNullableNumber(entry.partyId),
        partyName: readText(entry.partyName),
        partyLabel: readText(entry.partyLabel),
      }))
      .filter(entry => entry.id),

    warnings: objects(file.warnings)
      .map(warning => ({
        code: asString(warning.code),
        id: asString(warning.id),
      })),

    untrackedTotals: objects(file.untrackedTotals)
      .map(total => ({
        owner: asString(total.owner),
        month: asNumber(asObject(total.month)?.actual),
        year: asNumber(asObject(total.year)?.actual),
        months: objects(total.months)
          .map(item => ({
            month: asString(item.month),
            actual: asNumber(item.actual),
          }))
          .filter(item => /^\d{4}-\d{2}$/.test(item.month)),
      }))
      .filter(total => total.owner),
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
   Événements PWA-MEX_<AAAAMMJJHHMMSS>_<id>[_DEL].json (§ 4)

   MOBILE_EXPENSE_SAVED : création ou modification ; un
   événement dont clientUpdatedAt n'est pas plus récent que
   la base ne change rien (envoi répété sans effet). Pas de
   tag. Commerçant facultatif : partyId ou partyName (100
   caractères au plus), au plus l'un des deux. Saisie liée :
   seuls subCategoryId, comment et le commerçant peuvent
   changer ; saisie allouée ou annulée : refus.

   MOBILE_EXPENSE_CANCELLED (suffixe _DEL) : annulation ;
   saisie liée : le Mac défait la liaison ; mouvement libéré :
   refus ; saisie inconnue ou déjà annulée : succès.

   Statut dans events/status/<même nom>.
========================= */

export const MOBILE_EXPENSE_EVENT_TRIGRAM = "MEX";

export const MOBILE_EXPENSE_EVENT_VERSION = 1;

export const MOBILE_EXPENSE_CANCEL_SUFFIX = "_DEL";

export interface MobileExpenseSave {
  id: string;

  /* Heure locale de l'iPhone, AAAA-MM-JJTHH:MM:SS. */
  paidAt: string;

  cardId: number;
  amount: number;
  currency: string;
  subCategoryId: number;
  comment: string;

  /* Commerçant : partie choisie ou texte libre, au plus l'un des deux. */
  partyId: number | null;
  partyName: string | null;

  clientUpdatedAt: string;
}

export const PARTY_NAME_MAX = 100;

export interface MobileExpenseCancel {
  id: string;
  clientUpdatedAt: string;
}
