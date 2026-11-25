import { localEnvId } from "./environmentState";

/* =========================
   Stockage de l'iPhone (localStorage)

   Clés préfixées ht:<envId>: (contrat multi-environnements,
   §10), envId connu par whoami ou, hors ligne, par le coffre
   de la clé. Sans environnement, rien n'est lu ni écrit.

   iOS peut vider ce stockage après une longue inutilisation
   (accepté) ; une valeur illisible est ignorée.
========================= */

function storageKey(
  name: string
): string | null {
  const env =
    localEnvId();

  return env
    ? `ht:${env}:${name}`
    : null;
}

/* Valeur rangée, convertie par read ; null si absente ou illisible. */
export function readStored<T>(
  name: string,
  read: (raw: unknown) => T
): T | null {
  const key =
    storageKey(name);

  if (!key) {
    return null;
  }

  try {
    const text =
      localStorage.getItem(key);

    return text === null
      ? null
      : read(JSON.parse(text) as unknown);

  } catch {
    return null;
  }
}

/* Faux si l'écriture échoue (stockage plein ou indisponible). */
export function writeStored(
  name: string,
  value: unknown
): boolean {
  const key =
    storageKey(name);

  if (!key) {
    return false;
  }

  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
