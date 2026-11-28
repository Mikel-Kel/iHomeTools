import {
  RECEIPT_MAX_BYTES,
  RECEIPT_PATH,
  readReceiptReading,
  type ReceiptReading,
} from "@/contracts/receipt";

import { readProxyErrorBody } from "@/contracts/environment";

import type { Party } from "@/contracts/parties";

import { parties } from "@/services/mobile/mobileData";

import {
  proxyFetch,
  ProxyError,
} from "@/services/proxy/proxyClient";

import { searchKey } from "@/utils/searchText";

import { log } from "@/utils/logger";

/* =========================
   Lecture d'un ticket de caisse (Add, « Scan receipt »)

   Photo redressée (orientation de l'iPhone, appliquée par
   Safari au dessin), réduite à 1500 px au plus sur le grand
   côté et recompressée en JPEG (150 à 400 Ko), puis envoyée
   au proxy (POST /api/receipt/read, contrat
   multi-environnements §5.3), qui la fait lire par l'API
   Claude. Rien n'est gardé, ni ici ni sur le proxy.

   Commerçant : partie de settings/parties.json retrouvée
   d'après le nom usuel (merchantBrand), sinon d'après le
   texte du ticket (merchant) ; sans partie, le nom usuel est
   repris en texte libre (ExpenseForm).
   Échec : message en anglais, prêt à afficher ; le
   formulaire reste à remplir à la main.
========================= */

const MAX_SIDE = 1500;

const JPEG_QUALITIES = [0.8, 0.6];

/* Le proxy répond en moins de 30 s (délai de gunicorn), nouvelle tentative comprise. */
const RECEIPT_TIMEOUT_MS = 35_000;

/* Libellé ou alias trop court pour être cherché dans le texte d'un ticket. */
const MIN_PARTY_KEY = 4;

export class ReceiptError extends Error {
  constructor(
    message: string
  ) {
    super(message);
    this.name = "ReceiptError";
  }
}

async function loadImage(
  photo: Blob
): Promise<HTMLImageElement> {
  const url =
    URL.createObjectURL(photo);

  try {
    const image =
      new Image();

    image.src = url;
    await image.decode();

    return image;

  } catch {
    throw new ReceiptError("This photo cannot be opened: take it again.");

  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

/* Photo réduite et recompressée, sous la limite du proxy. */
async function prepareImage(
  photo: Blob
): Promise<Blob> {
  const image =
    await loadImage(photo);

  const scale =
    Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));

  const canvas =
    document.createElement("canvas");

  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new ReceiptError("This photo cannot be prepared on this iPhone.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of JPEG_QUALITIES) {
    const jpeg =
      await toJpeg(canvas, quality);

    if (jpeg && jpeg.size <= RECEIPT_MAX_BYTES) {
      return jpeg;
    }
  }

  throw new ReceiptError("This photo is too large to be read.");
}

/* Message d'un refus du proxy (§5.4). */
function failureMessage(
  code: string,
  status: number
): string {
  switch (code) {
    case "CAPABILITY_DENIED":
      return "Receipt reading is not enabled for this environment.";

    case "RECEIPT_UNAVAILABLE":
      return "Receipt reading is not set up on the home services yet.";

    case "UPSTREAM_ERROR":
      return "The receipt could not be read: try again, or enter the expense by hand.";

    case "PAYLOAD_TOO_LARGE":
    case "UNSUPPORTED_MEDIA":
      return "This photo was not accepted: take it again.";

    default:
      return `The receipt could not be read (HTTP ${status}).`;
  }
}

export async function readReceipt(
  photo: Blob
): Promise<ReceiptReading> {
  const image =
    await prepareImage(photo);

  let response: Response;

  try {
    response =
      await proxyFetch(
        RECEIPT_PATH,
        {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body: image,
          timeoutMs: RECEIPT_TIMEOUT_MS,
        }
      );

  } catch (err) {
    log.warn("[Receipt] not sent", err);

    throw new ReceiptError(
      err instanceof ProxyError && err.kind === "timeout"
        ? "The receipt took too long to read: try again, or enter the expense by hand."
        : "Home services unreachable: enter the expense by hand."
    );
  }

  if (!response.ok) {
    let code = "";

    try {
      code = readProxyErrorBody(await response.json())?.code ?? "";
    } catch {
      code = "";
    }

    throw new ReceiptError(failureMessage(code, response.status));
  }

  try {
    return readReceiptReading(await response.json());
  } catch (err) {
    log.warn("[Receipt] invalid answer", err);
    throw new ReceiptError("The receipt could not be read: try again, or enter the expense by hand.");
  }
}

/* Texte comparé mot à mot : sans casse ni accents, ponctuation remplacée par des espaces. */
function wordKey(
  text: string
): string {
  return ` ${searchKey(text).replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/*
  Partie du commerçant lu : libellé ou alias égal au nom
  usuel, sinon libellé ou alias (4 caractères au moins) qui
  figure en mots entiers dans le nom usuel ou le texte du
  ticket, le plus long d'abord ; à égalité, la plus utilisée
  (ordre de la liste). null : aucune.
*/
export function receiptParty(
  reading: ReceiptReading
): Party | null {
  const brand =
    reading.merchantBrand ? wordKey(reading.merchantBrand) : "";

  const printed =
    reading.merchant ? wordKey(reading.merchant) : "";

  if (!brand.trim() && !printed.trim()) {
    return null;
  }

  let best: Party | null = null;
  let bestLength = 0;

  for (const party of parties.value) {
    const keys =
      [party.label, ...party.aliases]
        .map(wordKey)
        .filter(key => key.trim().length > 0);

    if (brand.trim() && keys.includes(brand)) {
      return party;
    }

    for (const key of keys) {
      const length =
        key.trim().length;

      if (
        length >= MIN_PARTY_KEY &&
        length > bestLength &&
        (brand.includes(key) || printed.includes(key))
      ) {
        best = party;
        bestLength = length;
      }
    }
  }

  return best;
}
