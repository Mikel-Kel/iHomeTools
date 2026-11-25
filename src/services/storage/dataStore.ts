import { proxyFetch } from "@/services/proxy/proxyClient";

/* =========================
   Magasin de données (Object Storage)

   Lecture des fichiers publiés par le Mac dans le magasin
   data, toujours par le proxy (/api/s3/read) : jamais
   d'accès S3 direct (Hetzner refuse les requêtes signées par
   le navigateur). La requête nomme le magasin (store), jamais
   le bucket (contrat multi-environnements, §6).
========================= */

const DATA_STORE = "data";

function normalizeKey(
  path: string
): string {
  return path
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

/* JSON de l'objet, null s'il n'existe pas. */
export async function readDataJson(
  path: string
): Promise<unknown | null> {
  const key =
    normalizeKey(path);

  const response =
    await proxyFetch(
      "/api/s3/read",
      { params: { store: DATA_STORE, key } }
    );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Read failed: HTTP ${response.status} for ${key}`
    );
  }

  const text =
    await response.text();

  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${key}: ${
        err instanceof Error
          ? err.message
          : String(err)
      }`
    );
  }
}
