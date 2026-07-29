import { computeEstimateTotals, computeItemTotal } from "@/lib/estimateUtils";
import type { QuoteDoc } from "@/lib/quotes";
import type { ProjectDoc } from "@/lib/projects";
import type { QuoteDraftItemDoc } from "@/lib/quoteDraftItems";
import {
  computeAiSetupTotals,
  parseAiSetupMeta,
  plainNotesFromQuoteDraft,
  resolveAiSetupCalculation,
  resolveSetupMaterialRows,
  resolveWorkEstimateForQuoteItems,
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
  const workEstimate = resolveWorkEstimateForQuoteItems(
    quoteItems,
    tasks,
    meta?.workEstimate
  );
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
  const setupTotals = computeAiSetupTotals(materialRows, workEstimate, calculation);

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

  // Footer must match visible lines (incl. manually added items). Prefer live
  // line sum over stale AI freeze; keep setup totals only when lines are empty
  // (flat-rate / summary-only drafts).
  const lineTotals = computeEstimateTotals(items, calculation.vatPercent);
  const useLineTotals = items.some((i) => i.total > 0);
  const subtotal = useLineTotals ? lineTotals.subtotal : setupTotals.netTotal;
  const vatAmount = useLineTotals ? lineTotals.vatAmount : setupTotals.vatAmount;
  const grandTotal = useLineTotals ? lineTotals.grandTotal : setupTotals.grossTotal;

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
    subtotal,
    vatPercent: calculation.vatPercent,
    vatAmount,
    grandTotal,
    currency: resolvedCurrency,
    notes: plainNotesFromQuoteDraft(project.quoteDraftNotes),
    orgId: project.orgId,
    ownerId: project.ownerId,
    workspaceType: project.workspaceType,
    workspaceId: project.workspaceId,
  };
}
