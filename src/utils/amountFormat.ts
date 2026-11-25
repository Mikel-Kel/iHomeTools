/* =========================
   Format des montants

   Même format que HomeTools, indépendant de la langue du
   navigateur : apostrophe pour les milliers, point décimal.
========================= */

const NUMBER_LOCALE = "de-CH";

export function formatAmount(
  amount: number | null | undefined,
  fractionDigits = 2
): string {
  if (amount == null) {
    return "";
  }

  return amount.toLocaleString(NUMBER_LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
