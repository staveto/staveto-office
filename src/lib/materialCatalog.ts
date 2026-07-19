import type {
  MaterialCategory,
  MaterialSuggestionSource,
  MaterialUnit,
} from "@/services/materials/types";

/** Canonical units stored on material documents. */
export const MATERIAL_UNITS: MaterialUnit[] = [
  "pcs",
  "m",
  "m2",
  "m3",
  "cm",
  "km",
  "kg",
  "g",
  "l",
  "pack",
  "box",
  "roll",
  "hour",
  "set",
  "pair",
  "other",
];

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "cable",
  "electrical_component",
  "installation_box",
  "breaker_or_protection",
  "connector",
  "fastener",
  "pipe_or_conduit",
  "board_or_panel",
  "insulation",
  "adhesive_or_sealant",
  "paint_or_coating",
  "concrete_or_mortar",
  "wood",
  "metal",
  "plumbing",
  "hvac",
  "tool_accessory",
  "consumable",
  "transport",
  "service_or_labor",
  "discount",
  "other_material",
  "unknown",
];

export function parseMaterialUnit(value: unknown): MaterialUnit | undefined {
  if (typeof value !== "string") return undefined;
  return (MATERIAL_UNITS as readonly string[]).includes(value)
    ? (value as MaterialUnit)
    : undefined;
}

export function parseMaterialCategory(value: unknown): MaterialCategory | undefined {
  if (typeof value !== "string") return undefined;
  return (MATERIAL_CATEGORIES as readonly string[]).includes(value)
    ? (value as MaterialCategory)
    : undefined;
}

export function parseMaterialSource(value: unknown): MaterialSuggestionSource {
  if (value === "ai" || value === "ocr" || value === "document" || value === "manual") return value;
  return "manual";
}

export function resolveMaterialCurrency(opts: {
  expenseCurrency?: string | null;
  projectCurrency?: string | null;
  userCurrency?: string | null;
  fallback?: string;
}): string {
  for (const c of [opts.expenseCurrency, opts.projectCurrency, opts.userCurrency, opts.fallback, "EUR"]) {
    const code = typeof c === "string" ? c.trim().toUpperCase() : "";
    if (/^[A-Z]{3}$/.test(code)) return code;
  }
  return "EUR";
}

export type MaterialTotalsGroup = {
  currency: string;
  totalPrice: number;
  count: number;
};

export type MaterialTotals = {
  count: number;
  groups: MaterialTotalsGroup[];
  totalPrice: number;
  currency: string;
};

export function calculateMaterialTotals(
  materials: Array<{ totalPrice?: number; currency?: string }>
): MaterialTotals {
  const byCurrency = new Map<string, { totalPrice: number; count: number }>();
  for (const m of materials) {
    const currency = resolveMaterialCurrency({ expenseCurrency: m.currency });
    const add = m.totalPrice ?? 0;
    const prev = byCurrency.get(currency) ?? { totalPrice: 0, count: 0 };
    byCurrency.set(currency, { totalPrice: prev.totalPrice + add, count: prev.count + 1 });
  }
  const groups = [...byCurrency.entries()]
    .map(([currency, g]) => ({ currency, totalPrice: g.totalPrice, count: g.count }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  const primary = groups[0] ?? { currency: "EUR", totalPrice: 0, count: 0 };
  return {
    count: materials.length,
    groups,
    totalPrice: primary.totalPrice,
    currency: primary.currency,
  };
}

export function formatMaterialTotalsDisplay(totals: MaterialTotals): string {
  if (totals.groups.length === 0) return `0.00 ${totals.currency}`;
  return totals.groups.map((g) => `${g.totalPrice.toFixed(2)} ${g.currency}`).join(" · ");
}
