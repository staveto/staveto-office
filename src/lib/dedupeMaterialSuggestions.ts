import type { AiMaterialSuggestion } from "./aiProjectSchema";

const STOP_WORDS = new Set([
  "und",
  "for",
  "fur",
  "fuer",
  "für",
  "the",
  "der",
  "die",
  "das",
  "von",
  "mit",
]);

export function normalizeMaterialName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9äöü]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function materialTokens(name: string): string[] {
  return normalizeMaterialName(name)
    .split(" ")
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));
}

export function areMaterialNamesSimilar(a: string, b: string): boolean {
  const na = normalizeMaterialName(a);
  const nb = normalizeMaterialName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = materialTokens(a);
  const tb = materialTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;

  let overlap = 0;
  for (const x of ta) {
    if (tb.some((y) => x === y || x.includes(y) || y.includes(x))) {
      overlap += 1;
    }
  }
  return overlap / Math.min(ta.length, tb.length) >= 0.6;
}

/** Merge overlapping AI material rows (materials[] + offer line items). */
export function dedupeMaterialSuggestions(
  items: AiMaterialSuggestion[]
): AiMaterialSuggestion[] {
  const sorted = [...items].sort((a, b) => b.name.length - a.name.length);
  const kept: AiMaterialSuggestion[] = [];

  for (const item of sorted) {
    const name = item.name?.trim();
    if (!name) continue;
    if (kept.some((k) => areMaterialNamesSimilar(k.name, name))) continue;
    kept.push({ ...item, name });
  }

  return kept;
}
