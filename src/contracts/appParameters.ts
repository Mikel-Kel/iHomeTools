import {
  asNullableNumber,
  asObject,
  asString,
} from "@/contracts/read";

/* =========================
   settings/AppParameters.json : version de référence

   Clé iHomeToolsVersion, écrite par myTooling à chaque
   livraison d'iHomeTools (Deliver), dans chaque
   environnement ; la clé version est celle de HomeTools.
   followUp.warningPercent : marge d'alerte de Follow-up
   (orange à moins de p % du budget), partagée avec
   HomeTools ; 10 si absente ou invalide.
   Seules ces clés sont lues : le reste du fichier n'est ni
   gardé ni journalisé.
========================= */

export const APP_PARAMETERS_FOLDER = "settings";

export const APP_PARAMETERS_FILE = "AppParameters.json";

/* Version x.y.z de référence ; null si absente ou illisible. */
export function readReferenceVersion(
  raw: unknown
): string | null {
  const version =
    asString(asObject(raw)?.iHomeToolsVersion).trim();

  return /^\d+\.\d+\.\d+$/.test(version)
    ? version
    : null;
}

export const DEFAULT_WARNING_PERCENT = 10;

/* Marge d'alerte en %, strictement entre 0 et 100 ; sinon la valeur par défaut. */
export function readWarningPercent(
  raw: unknown
): number {
  const value =
    asNullableNumber(asObject(asObject(raw)?.followUp)?.warningPercent);

  return value !== null && value > 0 && value < 100
    ? value
    : DEFAULT_WARNING_PERCENT;
}
