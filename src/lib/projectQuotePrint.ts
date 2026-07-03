import { computeItemTotal } from "@/lib/estimateUtils";
import type { QuoteDoc } from "@/lib/quotes";
import type { ProjectDoc } from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import {
  computeAiSetupTotals,
  parseAiSetupMeta,
  plainNotesFromQuoteDraft,
  resolveAiSetupCalculation,
  resolveSetupMaterialRows,
  workEstimateFromQuoteItems,
} from "@/components/projects/setup/aiSetupHelpers";
import { resolveQuoteCurrency } from "@/lib/workspace/countryConfig";
import type { TaskDoc } from "@/lib/projects";
import type { MaterialSuggestionDoc } from "@/services/materials/types";
import { buildProjectQuoteDisplayLines } from "@/lib/projectQuoteDraft";
import { filterCustomerQuoteItems } from "@/lib/quoteDocumentMeta";

export const PROJECT_DRAFT_QUOTE_ID_PREFIX = "project-draft-";

export function isProjectDraftQuoteId(id: string): boolean {
  return id.startsWith(PROJECT_DRAFT_QUOTE_ID_PREFIX);
}

export function projectIdFromDraftQuoteId(id: string): string | null {
  if (!isProjectDraftQuoteId(id)) return null;
  return id.slice(PROJECT_DRAFT_QUOTE_ID_PREFIX.length) || null;
}

export function buildQuoteDocFromProjectDraft(
  project: ProjectDoc,
  quoteItems: QuoteDraftItemDoc[],
  tasks: TaskDoc[] = [],
  currency?: string,
  suggestions: MaterialSuggestionDoc[] = [],
  countryCode?: string | null
): QuoteDoc {
  const meta = parseAiSetupMeta(project.quoteDraftNotes);
  const workEstimate = meta?.workEstimate ?? workEstimateFromQuoteItems(quoteItems, tasks);
  const calculation = resolveAiSetupCalculation(
    meta?.calculation,
    project.quoteDraftVatPercent,
    countryCode
  );
  const resolvedCurrency = resolveQuoteCurrency({ currency, countryCode });
  const materialRows = resolveSetupMaterialRows(quoteItems, suggestions, []);
  const visibleQuoteItems = filterCustomerQuoteItems(quoteItems, materialRows);
  const displayLines = buildProjectQuoteDisplayLines(
    project,
    visibleQuoteItems,
    tasks,
    suggestions
  );
  const totals = computeAiSetupTotals(materialRows, workEstimate, calculation);

  const quoteStatus = project.quoteStatus ?? "draft";
  const status: QuoteDoc["status"] =
    quoteStatus === "accepted"
      ? "accepted"
      : quoteStatus === "sent"
        ? "sent"
        : quoteStatus === "rejected"
          ? "rejected"
          : project.phase === "delivery" || project.salesStatus === "accepted"
            ? "accepted"
            : "draft";

  const items = displayLines.map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    qty: item.qty,
    unit: item.unit,
    unitPrice: item.unitPrice,
    total: computeItemTotal(item.qty, item.unitPrice),
  }));

  const clientName =
    project.customerCompanyName?.trim() ||
    project.customerName?.trim() ||
    project.name?.trim() ||
    "—";

  return {
    id: `${PROJECT_DRAFT_QUOTE_ID_PREFIX}${project.id}`,
    updatedAt: project.updatedAt ?? project.createdAt,
    createdAt: project.createdAt,
    title: project.name?.trim() || "Angebot",
    projectId: project.id,
    projectName: project.name,
    clientName,
    clientEmail: project.customerEmail,
    status,
    items,
    subtotal: totals.netTotal,
    vatPercent: calculation.vatPercent,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grossTotal,
    currency: resolvedCurrency,
    notes: plainNotesFromQuoteDraft(project.quoteDraftNotes),
    orgId: project.orgId,
    ownerId: project.ownerId,
    workspaceType: project.workspaceType,
    workspaceId: project.workspaceId,
  };
}
