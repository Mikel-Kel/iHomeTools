import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asString,
  type JsonObject,
} from "@/contracts/read";

/* =========================
   Export settings/parties.json

   Contrat : ../Backend/docs/parties-contract.md, § 2 ; lu tel
   quel par l'iPhone (contrat mobile, § 5). Seuls les champs
   utiles au choix du commerçant sont gardés : id, label,
   typeId, generic, aliases, usage.allocations (tri : les
   plus utilisées d'abord).

   Pas proposées : parties réservées -1 (N/A) et 0 (To
   assign), dossiers d'archives (types -1 et -2). Les parties
   génériques restent proposées.

   La copie gardée sur l'iPhone a la même forme, réduite à
   ces champs : le même lecteur sert aux deux.
========================= */

export const PARTIES_FOLDER = "settings";

export const PARTIES_FILE = "parties.json";

const RESERVED_PARTY_IDS = [-1, 0];

const ARCHIVE_FOLDER_TYPE_IDS = [-1, -2];

export interface Party {
  id: number;
  label: string;
  typeId: number;
  generic: boolean;
  aliases: string[];

  /* Nombre d'allocations qui l'utilisent. */
  allocations: number;
}

/* Parties proposées, les plus utilisées d'abord ; fichier illisible : liste vide. */
export function readParties(
  raw: unknown
): Party[] {
  return asArray(asObject(raw)?.parties)
    .map(asObject)
    .filter((party): party is JsonObject => party !== null)
    .map(party => ({
      id: asNumber(party.id, Number.NaN),
      label: asString(party.label).trim(),
      typeId: asNumber(party.typeId),
      generic: asBoolean(party.generic),
      aliases: asArray(party.aliases)
        .filter((alias): alias is string => typeof alias === "string" && alias.trim() !== ""),
      allocations: asNumber(asObject(party.usage)?.allocations),
    }))
    .filter(party =>
      Number.isInteger(party.id) &&
      party.label !== "" &&
      !RESERVED_PARTY_IDS.includes(party.id) &&
      !ARCHIVE_FOLDER_TYPE_IDS.includes(party.typeId)
    )
    .sort((a, b) => b.allocations - a.allocations || a.label.localeCompare(b.label));
}

/* Copie réduite gardée sur l'iPhone, relue par readParties. */
export function partiesCache(
  parties: Party[]
): { parties: JsonObject[] } {
  return {
    parties: parties.map(party => ({
      id: party.id,
      label: party.label,
      typeId: party.typeId,
      generic: party.generic,
      aliases: party.aliases,
      usage: { allocations: party.allocations },
    })),
  };
}
