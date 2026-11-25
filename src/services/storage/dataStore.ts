import { proxyFetch } from "@/services/proxy/proxyClient";

/* =========================
   Magasin de données (Object Storage)

   Lecture des fichiers publiés par le Mac et écriture des
   événements dans le magasin data, toujours par le proxy
   (/api/s3/read, /api/s3/write) : jamais d'accès S3 direct
   (Hetzner refuse les requêtes signées par le navigateur). La
   requête nomme le magasin (store), jamais le bucket (contrat
   multi-environnements, §6).
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

/* Écrit (ou remplace) l'objet JSON. */
export async function writeDataJson(
  path: string,
  data: unknown
): Promise<void> {
  const key =
    normalizeKey(path);

  const response =
    await proxyFetch(
      "/api/s3/write",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          store: DATA_STORE,
          key,
          content: JSON.stringify(data, null, 2),
          contentType: "application/json; charset=utf-8",
        }),
      }
    );

  if (!response.ok) {
    throw new Error(
      `Write failed: HTTP ${response.status} for ${key}`
    );
  }
}
