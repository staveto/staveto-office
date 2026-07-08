import { computeItemTotal } from "@/lib/estimateUtils";
import { MATERIAL_UNITS, parseMaterialUnit } from "@/lib/materialCatalog";
import type { MaterialSuggestionDoc, ProjectMaterialDoc } from "@/services/materials/types";
import type { MaterialUnit } from "@/services/materials/types";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import type { TaskDoc } from "@/lib/projects";
import type { QuoteDocumentMeta } from "@/lib/quoteDocumentMeta";
import { isCustomerVisibleItemName } from "@/lib/quoteCustomerItems";
import { defaultVatPercentForCountry } from "@/lib/workspace/countryConfig";
import {
  applyFactsToMaterialRows,
  type AttachmentFindingLike,
  type ProjectFactsLike,
} from "@/lib/ai/materialQuantityFromFacts";
import type {
  AiProjectFactsPersisted,
  AiSetupCalculation,
  AiSetupMaterialRow,
  AiSetupPersistedMeta,
  AiSetupTotals,
  AiSetupWorkEstimate,
} from "./aiSetupTypes";

export function parseAiSetupMeta(notes?: string | null): AiSetupPersistedMeta | null {
  if (!notes?.trim()) return null;
  try {
    const parsed = JSON.parse(notes) as { aiSetupMeta?: AiSetupPersistedMeta & Record<string, unknown> };
    if (!parsed?.aiSetupMeta) return null;
    const meta = parsed.aiSetupMeta;
    const result: AiSetupPersistedMeta = {};
    if (meta.workEstimate && meta.calculation) {
      result.workEstimate = meta.workEstimate;
      result.calculation = normalizeCalculation(meta.calculation, undefined);
    }
    if (meta.projectFacts) {
      result.projectFacts = meta.projectFacts as AiProjectFactsPersisted;
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function normalizeCalculation(
  calc: AiSetupCalculation,
  countryCode?: string | null
): AiSetupCalculation {
  return {
    marginPercent: calc.marginPercent ?? 15,
    vatPercent: calc.vatPercent ?? defaultVatPercentForCountry(countryCode),
    otherCosts: calc.otherCosts ?? 0,
    materialTotalOverride: calc.materialTotalOverride ?? null,
    workTotalOverride: calc.workTotalOverride ?? null,
    manualGrossTotal: calc.manualGrossTotal ?? null,
  };
}

/** Apply workspace market defaults; fixes legacy CH-only VAT when company is SK/EU. */
export function resolveAiSetupCalculation(
  saved: AiSetupCalculation | undefined,
  projectVatPercent: number | undefined,
  countryCode: string | null | undefined
): AiSetupCalculation {
  const marketVat = defaultVatPercentForCountry(countryCode);
  if (!saved) {
    return defaultCalculation(projectVatPercent, countryCode);
  }
  const cc = countryCode?.trim().toUpperCase();
  if (cc && cc !== "CH" && saved.vatPercent === 8.1) {
    return { ...saved, vatPercent: marketVat };
  }
  return normalizeCalculation(saved, countryCode);
}

export function serializeAiSetupMeta(
  meta: AiSetupPersistedMeta,
  plainNotes?: string,
  quoteDocumentMeta?: QuoteDocumentMeta
): string {
  const payload: {
    aiSetupMeta: AiSetupPersistedMeta;
    quoteDocumentMeta?: QuoteDocumentMeta;
    plainNotes?: string;
  } = { aiSetupMeta: meta };
  if (quoteDocumentMeta && Object.keys(quoteDocumentMeta).length > 0) {
    payload.quoteDocumentMeta = quoteDocumentMeta;
  }
  const trimmed = plainNotes?.trim();
  if (trimmed) payload.plainNotes = trimmed;
  return JSON.stringify(payload);
}

export function plainNotesFromQuoteDraft(notes?: string | null): string {
  if (!notes?.trim()) return "";
  try {
    const parsed = JSON.parse(notes) as { plainNotes?: string };
    return parsed.plainNotes?.trim() ?? "";
  } catch {
    return notes.trim();
  }
}

export function newLocalId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function materialRowsFromSuggestions(suggestions: MaterialSuggestionDoc[]): AiSetupMaterialRow[] {
  return suggestions.map((s) => ({
    id: newLocalId(),
    suggestionId: s.id,
    name: s.name,
    qty: s.suggestedQuantity && s.suggestedQuantity > 0 ? s.suggestedQuantity : 1,
    unit: normalizeSetupUnit(s.unit),
    price: s.estimatedUnitPrice ?? 0,
    included: s.status !== "rejected",
    customerVisible: isCustomerVisibleItemName(s.name),
    sourceNote: s.sourceNote?.trim() || s.description?.trim() || undefined,
    confidence: s.confidence,
  }));
}

export function applyProjectFactsToMaterialRows(
  rows: AiSetupMaterialRow[],
  facts?: ProjectFactsLike | null,
  findings?: AttachmentFindingLike[] | null
): AiSetupMaterialRow[] {
  return applyFactsToMaterialRows(rows, facts, findings);
}

export function materialRowsFromProjectMaterials(materials: ProjectMaterialDoc[]): AiSetupMaterialRow[] {
  return materials.map((m) => ({
    id: newLocalId(),
    name: m.name,
    qty: m.quantity > 0 ? m.quantity : 1,
    unit: normalizeSetupUnit(m.unit),
    price: m.unitPrice ?? 0,
    included: true,
    customerVisible: isCustomerVisibleItemName(m.name),
  }));
}

export const AI_SETUP_MATERIAL_UNITS: MaterialUnit[] = [
  "pcs",
  "m",
  "m2",
  "m3",
  "kg",
  "l",
  "pack",
  "set",
  "other",
];

const LEGACY_UNIT_ALIASES: Record<string, MaterialUnit> = {
  ks: "pcs",
  stk: "pcs",
  stück: "pcs",
  stck: "pcs",
  piece: "pcs",
  pieces: "pcs",
  "m²": "m2",
  "m³": "m3",
  hod: "hour",
  std: "hour",
  h: "hour",
};

export function normalizeSetupUnit(unit?: string | null): MaterialUnit {
  const raw = (unit ?? "").trim().toLowerCase();
  if (LEGACY_UNIT_ALIASES[raw]) return LEGACY_UNIT_ALIASES[raw];
  const parsed = parseMaterialUnit(unit);
  if (parsed) return parsed;
  return "pcs";
}

export function setupUnitLabel(unit: string, t: (key: string) => string): string {
  const canonical = normalizeSetupUnit(unit);
  const key = `materials.unit.${canonical}`;
  const label = t(key);
  return label === key ? canonical : label;
}

export function isSetupMaterialUnit(unit: string): unit is MaterialUnit {
  return (MATERIAL_UNITS as readonly string[]).includes(unit);
}

export function resolveSetupMaterialRows(
  quoteItems: QuoteDraftItemDoc[],
  suggestions: MaterialSuggestionDoc[],
  projectMaterials: ProjectMaterialDoc[]
): AiSetupMaterialRow[] {
  const fromQuote = materialRowsFromQuoteItems(quoteItems);
  const fromSuggestions = materialRowsFromSuggestions(suggestions);
  const fromProject = materialRowsFromProjectMaterials(projectMaterials);
  const aiSource =
    fromProject.length >= fromSuggestions.length ? fromProject : fromSuggestions;

  if (fromQuote.length === 0) {
    return aiSource;
  }

  return mergeQuoteRowsWithAiHints(fromQuote, aiSource);
}

/** Quote items are the saved source of truth; enrich zero prices from AI hints. */
function mergeQuoteRowsWithAiHints(
  fromQuote: AiSetupMaterialRow[],
  aiSource: AiSetupMaterialRow[]
): AiSetupMaterialRow[] {
  if (aiSource.length === 0) return fromQuote;

  const aiByName = new Map(aiSource.map((m) => [m.name.trim().toLowerCase(), m]));
  const merged = fromQuote.map((row) => {
    const ai = aiByName.get(row.name.trim().toLowerCase());
    if (!ai) return row;
    return {
      ...row,
      price: row.price > 0 ? row.price : ai.price,
      qty: row.qty > 1 ? row.qty : ai.qty > 0 ? ai.qty : row.qty,
      unit: row.qty > 1 ? row.unit : ai.qty > 1 ? ai.unit : row.unit,
      suggestionId: row.suggestionId ?? ai.suggestionId,
      sourceNote: row.sourceNote?.trim() || ai.sourceNote,
      confidence: row.confidence ?? ai.confidence,
    };
  });

  const quoteNames = new Set(fromQuote.map((q) => q.name.trim().toLowerCase()));
  const extras = aiSource.filter((ai) => !quoteNames.has(ai.name.trim().toLowerCase()));
  return [...merged, ...extras];
}

export function materialRowsFromQuoteItems(items: QuoteDraftItemDoc[]): AiSetupMaterialRow[] {
  return items
    .filter((i) => i.category === "material")
    .map((i) => ({
      id: i.id,
      quoteItemId: i.id,
      name: i.name,
      qty: i.qty,
      unit: normalizeSetupUnit(i.unit),
      price: i.unitPrice,
      included: true,
      customerVisible:
        i.customerVisible === false
          ? false
          : i.customerVisible === true
            ? true
            : isCustomerVisibleItemName(i.name),
    }));
}

export function seedWorkEstimate(tasks: TaskDoc[]): AiSetupWorkEstimate {
  const taskCount = tasks.length;
  const hours = taskCount > 0 ? Math.max(8, Math.round(taskCount * 1.5)) : 16;
  return {
    workers: 2,
    hours,
    hourlyRate: 85,
    note: "",
  };
}

export function workEstimateFromQuoteItems(
  items: QuoteDraftItemDoc[],
  tasks: TaskDoc[]
): AiSetupWorkEstimate {
  const workItems = items.filter((i) => i.category === "work");
  if (workItems.length === 0) return seedWorkEstimate(tasks);

  const hours = workItems.reduce((sum, w) => sum + (w.qty > 0 ? w.qty : 0), 0);
  const totalValue = workItems.reduce((sum, w) => sum + w.qty * w.unitPrice, 0);
  const hourlyRate = hours > 0 ? Math.round((totalValue / hours) * 100) / 100 : 85;

  return {
    workers: 2,
    hours: hours > 0 ? hours : 16,
    hourlyRate: hourlyRate > 0 ? hourlyRate : 85,
    note: workItems.length === 1 ? workItems[0].note ?? "" : "",
    quoteItemId: workItems.length === 1 ? workItems[0].id : undefined,
  };
}

export function defaultCalculation(
  vatPercent?: number,
  countryCode?: string | null
): AiSetupCalculation {
  return {
    marginPercent: 15,
    vatPercent: vatPercent ?? defaultVatPercentForCountry(countryCode),
    otherCosts: 0,
    materialTotalOverride: null,
    workTotalOverride: null,
    manualGrossTotal: null,
  };
}

export function computeMaterialSubtotal(materials: AiSetupMaterialRow[]): number {
  return materials
    .filter((m) => m.included)
    .reduce((sum, m) => sum + computeItemTotal(m.qty, m.price), 0);
}

export function computeWorkSubtotal(work: AiSetupWorkEstimate): number {
  return computeItemTotal(work.hours, work.hourlyRate);
}

export function freezeCalculationForSave(
  calculation: AiSetupCalculation,
  totals: AiSetupTotals
): AiSetupCalculation {
  return {
    ...calculation,
    materialTotalOverride: calculation.materialTotalOverride ?? totals.materialCost,
    workTotalOverride: calculation.workTotalOverride ?? totals.workCost,
    manualGrossTotal: calculation.manualGrossTotal ?? totals.grossTotal,
  };
}

export function computeAiSetupTotals(
  materials: AiSetupMaterialRow[],
  work: AiSetupWorkEstimate,
  calc: AiSetupCalculation
): AiSetupTotals {
  const materialComputed = computeMaterialSubtotal(materials);
  const workComputed = computeWorkSubtotal(work);
  const materialCost = resolveFrozenOverride(calc.materialTotalOverride, materialComputed);
  const workCost = resolveFrozenOverride(calc.workTotalOverride, workComputed);
  const otherCosts = calc.otherCosts;

  const subtotalBeforeMargin = materialCost + workCost + otherCosts;
  const marginAmount =
    Math.round(subtotalBeforeMargin * (calc.marginPercent / 100) * 100) / 100;
  const netTotal = Math.round((subtotalBeforeMargin + marginAmount) * 100) / 100;
  const vatAmount = Math.round(netTotal * (calc.vatPercent / 100) * 100) / 100;
  const grossComputed = Math.round((netTotal + vatAmount) * 100) / 100;
  const lineSubtotal = materialComputed + workComputed + otherCosts;
  const manualTotalActive =
    calc.manualGrossTotal != null &&
    calc.manualGrossTotal >= 0 &&
    lineSubtotal <= 0.001;
  const grossTotal = manualTotalActive ? calc.manualGrossTotal! : grossComputed;

  return {
    materialCost,
    workCost,
    otherCosts,
    subtotal: subtotalBeforeMargin,
    marginAmount,
    netTotal,
    vatAmount,
    grossTotal,
    manualTotalActive,
  };
}

/** Ignore frozen 0 overrides when line items now have real totals. */
function resolveFrozenOverride(
  override: number | null | undefined,
  computed: number
): number {
  if (override == null) return computed;
  if (override === 0 && computed > 0) return computed;
  return override;
}
