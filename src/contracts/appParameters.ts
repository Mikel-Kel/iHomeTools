import {
  asObject,
  asString,
} from "@/contracts/read";

/* =========================
   settings/AppParameters.json : version de référence

   Clé iHomeToolsVersion, écrite par myTooling à chaque
   livraison d'iHomeTools (Deliver), dans chaque
   environnement ; la clé version est celle de HomeTools.
   Seule cette clé est lue : le reste du fichier n'est ni
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
