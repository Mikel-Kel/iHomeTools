/* =========================
   Texte de recherche

   Comparaison sans casse ni accents, espaces réduits : « Café »
   et « cafe » se valent.
========================= */

export function searchKey(
  text: string
): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/* Rogné, espaces multiples réduits (texte envoyé au Mac). */
export function tidyText(
  text: string
): string {
  return text.trim().replace(/\s+/g, " ");
}
