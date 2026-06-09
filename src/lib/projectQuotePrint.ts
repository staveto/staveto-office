import { computeItemTotal } from "@/lib/estimateUtils";
import type { QuoteDoc } from "@/lib/quotes";
import type { ProjectDoc } from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import {
  computeAiSetupTotals,
  defaultCalculation,
  materialRowsFromQuoteItems,
  parseAiSetupMeta,
  plainNotesFromQuoteDraft,
  workEstimateFromQuoteItems,
} from "@/components/projects/setup/aiSetupHelpers";
import type { TaskDoc } from "@/lib/projects";

export function buildQuoteDocFromProjectDraft(
  project: ProjectDoc,
  quoteItems: QuoteDraftItemDoc[],
  tasks: TaskDoc[] = [],
  currency = "CHF"
): QuoteDoc {
  const materials = materialRowsFromQuoteItems(quoteItems);
  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const workEstimate = meta?.workEstimate ?? workEstimateFromQuoteItems(quoteItems, tasks);
  const calculation = meta?.calculation ?? defaultCalculation(project.quoteDraftVatPercent);
  const totals = computeAiSetupTotals(materials, workEstimate, calculation);

  const items = quoteItems.map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    qty: item.qty > 0 ? item.qty : 1,
    unit: item.unit,
    unitPrice: item.unitPrice >= 0 ? item.unitPrice : 0,
    total: computeItemTotal(item.qty > 0 ? item.qty : 1, item.unitPrice >= 0 ? item.unitPrice : 0),
  }));

  const clientName =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    project.name?.trim() ||
    "—";

  return {
    id: `project-draft-${project.id}`,
    title: project.name?.trim() || "Angebot",
    projectId: project.id,
    projectName: project.name,
    clientName,
    clientEmail: project.customerEmail,
    status: "draft",
    items,
    subtotal: totals.netTotal,
    vatPercent: calculation.vatPercent,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grossTotal,
    currency,
    notes: plainNotesFromQuoteDraft(project.quoteDraftNotes),
    orgId: project.orgId,
    ownerId: project.ownerId,
    workspaceType: project.workspaceType,
    workspaceId: project.workspaceId,
  };
}
