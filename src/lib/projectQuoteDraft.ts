/**
 * Build Firestore quote line items from a project draft (quoteItems, AI meta, tasks).
 */
import type { ProjectDoc } from "./projects";
import { listProjectQuoteDraftItems, listProjectTasks } from "./projects";
import type { QuoteItemInput } from "./quotes";
import { listMaterialSuggestions } from "@/services/materials/projectMaterialsService";
import type { MaterialSuggestionDoc } from "@/services/materials/types";
import {
  computeAiSetupTotals,
  defaultCalculation,
  parseAiSetupMeta,
  resolveSetupMaterialRows,
  workEstimateFromQuoteItems,
} from "@/components/projects/setup/aiSetupHelpers";

export async function resolveProjectQuoteLineItems(
  project: ProjectDoc
): Promise<QuoteItemInput[]> {
  const [quoteItems, tasks, suggestions] = await Promise.all([
    listProjectQuoteDraftItems(project.id),
    listProjectTasks(project.id),
    listMaterialSuggestions(project.id),
  ]);

  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const calc = meta?.calculation ?? defaultCalculation(project.quoteDraftVatPercent);
  const materials = resolveSetupMaterialRows(quoteItems, suggestions, []);
  const work = meta?.workEstimate ?? workEstimateFromQuoteItems(quoteItems, tasks);
  const totals = computeAiSetupTotals(materials, work, calc);

  const lines: QuoteItemInput[] = [];

  for (const m of materials) {
    if (!m.included || !m.name.trim()) continue;
    lines.push({
      category: "material",
      name: m.name.trim(),
      qty: m.qty > 0 ? m.qty : 1,
      unit: m.unit,
      unitPrice: m.price >= 0 ? m.price : 0,
    });
  }

  if (work.hours > 0 && work.hourlyRate > 0) {
    lines.push({
      category: "work",
      name: "Arbeit",
      qty: work.hours,
      unit: "h",
      unitPrice: work.hourlyRate,
    });
  }

  if (lines.length === 0) {
    if (totals.materialCost > 0) {
      lines.push({
        category: "material",
        name: "Material",
        qty: 1,
        unit: "Stk",
        unitPrice: totals.materialCost,
      });
    }
    if (totals.workCost > 0) {
      lines.push({
        category: "work",
        name: "Arbeit",
        qty: 1,
        unit: "h",
        unitPrice: totals.workCost,
      });
    }
  }

  return lines;
}

export function projectHasQuoteDraft(project: ProjectDoc): boolean {
  const qs = project.quoteStatus ?? "none";
  if (qs !== "none") return true;
  return parseAiSetupMeta(project.quoteDraftNotes) != null;
}

export type ProjectQuoteDisplayLine = {
  id: string;
  category: "material" | "work";
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

/** Full quote lines for UI/PDF preview (materials + work, incl. AI hints). */
export function buildProjectQuoteDisplayLines(
  project: ProjectDoc,
  quoteItems: Awaited<ReturnType<typeof listProjectQuoteDraftItems>>,
  tasks: Awaited<ReturnType<typeof listProjectTasks>>,
  suggestions: MaterialSuggestionDoc[] = []
): ProjectQuoteDisplayLine[] {
  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const materials = resolveSetupMaterialRows(quoteItems, suggestions, []);
  const work = meta?.workEstimate ?? workEstimateFromQuoteItems(quoteItems, tasks);
  const lines: ProjectQuoteDisplayLine[] = [];

  for (const m of materials) {
    if (!m.included || !m.name.trim()) continue;
    const qty = m.qty > 0 ? m.qty : 1;
    const unitPrice = m.price >= 0 ? m.price : 0;
    lines.push({
      id: m.id,
      category: "material",
      name: m.name.trim(),
      qty,
      unit: m.unit,
      unitPrice,
      lineTotal: qty * unitPrice,
    });
  }

  if (work.hours > 0 && work.hourlyRate > 0) {
    lines.push({
      id: work.quoteItemId ?? "work-line",
      category: "work",
      name: "Arbeit",
      qty: work.hours,
      unit: "h",
      unitPrice: work.hourlyRate,
      lineTotal: work.hours * work.hourlyRate,
    });
  }

  if (lines.length === 0) {
    const calc = meta?.calculation ?? defaultCalculation(project.quoteDraftVatPercent);
    const totals = computeAiSetupTotals(materials, work, calc);
    if (totals.materialCost > 0) {
      lines.push({
        id: "material-summary",
        category: "material",
        name: "Material",
        qty: 1,
        unit: "Stk",
        unitPrice: totals.materialCost,
        lineTotal: totals.materialCost,
      });
    }
    if (totals.workCost > 0) {
      lines.push({
        id: "work-summary",
        category: "work",
        name: "Arbeit",
        qty: 1,
        unit: "h",
        unitPrice: totals.workCost,
        lineTotal: totals.workCost,
      });
    }
  }

  return lines;
}
