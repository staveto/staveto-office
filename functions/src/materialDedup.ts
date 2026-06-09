import type { ProjectDraftPayload } from "./draftSchema";

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

function normalizeMaterialName(name: string): string {
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

function areMaterialNamesSimilar(a: string, b: string): boolean {
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

type MaterialRow = ProjectDraftPayload["materials"][number];

function dedupeMaterialRows(rows: MaterialRow[]): MaterialRow[] {
  const sorted = [...rows].sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));
  const kept: MaterialRow[] = [];

  for (const row of sorted) {
    const name = row.name?.trim();
    if (!name) continue;
    if (kept.some((k) => areMaterialNamesSimilar(k.name ?? "", name))) continue;
    kept.push({ ...row, name });
  }

  return kept;
}

/** Remove duplicate materials between materials[] and offer line items before persisting. */
export function sanitizeDraftMaterials(draft: ProjectDraftPayload): ProjectDraftPayload {
  const fromLines = (draft.offerPreparation?.suggestedLineItems ?? [])
    .filter((line) => line.category === "material")
    .map((line) => ({
      name: line.title?.trim() || "Material",
      quantity: line.quantity,
      unit: line.unit,
      note: line.description?.trim() || null,
    }));

  const materials = dedupeMaterialRows([...(draft.materials ?? []), ...fromLines]);

  const lineItems = (draft.offerPreparation?.suggestedLineItems ?? []).filter((line) => {
    if (line.category !== "material") return true;
    const title = line.title?.trim();
    if (!title) return false;
    return !materials.some((m) => areMaterialNamesSimilar(m.name, title));
  });

  return {
    ...draft,
    materials,
    offerPreparation: {
      ...draft.offerPreparation,
      suggestedLineItems: lineItems,
    },
  };
}
