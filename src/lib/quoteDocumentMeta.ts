/**
 * Business document fields for customer-facing quote / PDF output.
 * Stored in project.quoteDraftNotes JSON (additive, no schema migration).
 */
import type { TaskDoc, ProjectDoc } from "./projects";
import type { QuoteDraftItemDoc } from "./quoteDraftItems";
import type { QuoteDoc } from "@/lib/quotes";
import type { OrganizationPrintInfo } from "./organizationProfile";
import {
  computeAiSetupTotals,
  parseAiSetupMeta,
  resolveAiSetupCalculation,
  resolveSetupMaterialRows,
  workEstimateFromQuoteItems,
  type AiSetupTotals,
} from "@/components/projects/setup/aiSetupHelpers";
import { resolveQuoteCurrency } from "@/lib/workspace/countryConfig";
import { normalizeQuotePrintCategory } from "@/lib/quotePrint";
import type { MaterialSuggestionDoc } from "@/services/materials/types";
import { buildProjectQuoteDisplayLines } from "./projectQuoteDraft";
import { isCustomerVisibleItemName } from "./quoteCustomerItems";

export type QuoteContactPerson = {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
};

export type QuoteDocumentMeta = {
  scopeOfWork?: string;
  conditions?: string;
  executionPeriod?: string;
  paymentTerms?: string;
  warranty?: string;
  exclusions?: string;
  contactPerson?: QuoteContactPerson;
};

export type QuotePrintPriceSummary = {
  materialTotal: number;
  workTotal: number;
  otherTotal: number;
  netTotal: number;
  vatPercent: number;
  vatAmount: number;
  grossTotal: number;
  isComplete: boolean;
  isFlatRate: boolean;
};

export type QuotePrintContext = {
  scopeOfWork: string;
  conditions: string;
  executionPeriod?: string;
  paymentTerms?: string;
  warranty?: string;
  exclusions?: string;
  contactPerson: QuoteContactPerson;
  priceSummary: QuotePrintPriceSummary;
  currency: string;
  customerNumber?: string;
  projectNumber?: string;
};

type QuoteDraftNotesPayload = {
  aiSetupMeta?: unknown;
  quoteDocumentMeta?: QuoteDocumentMeta;
  plainNotes?: string;
};

export function parseQuoteDocumentMeta(notes?: string | null): QuoteDocumentMeta {
  if (!notes?.trim()) return {};
  try {
    const parsed = JSON.parse(notes) as QuoteDraftNotesPayload;
    return parsed.quoteDocumentMeta ?? {};
  } catch {
    return {};
  }
}

export function serializeQuoteDraftNotes(params: {
  aiSetupMeta: { workEstimate: unknown; calculation: unknown };
  quoteDocumentMeta?: QuoteDocumentMeta;
  plainNotes?: string;
}): string {
  const payload: QuoteDraftNotesPayload = {
    aiSetupMeta: params.aiSetupMeta,
  };
  if (params.quoteDocumentMeta && Object.keys(params.quoteDocumentMeta).length > 0) {
    payload.quoteDocumentMeta = params.quoteDocumentMeta;
  }
  const trimmed = params.plainNotes?.trim();
  if (trimmed) payload.plainNotes = trimmed;
  return JSON.stringify(payload);
}

const DEFAULT_SCOPE_KEYS = [
  "quotes.print.scope.prep",
  "quotes.print.scope.materials",
  "quotes.print.scope.execution",
  "quotes.print.scope.inspection",
  "quotes.print.scope.handover",
] as const;

function uniqueTaskScopeLines(tasks: TaskDoc[]): string[] {
  return tasks
    .map((t) => t.title?.trim())
    .filter((title): title is string => !!title && title.length > 3)
    .filter((title, index, arr) => arr.indexOf(title) === index)
    .slice(0, 6);
}

export function buildScopeOfWorkText(
  project: ProjectDoc,
  tasks: TaskDoc[],
  docMeta: QuoteDocumentMeta,
  t: (key: string) => string
): string {
  const saved = docMeta.scopeOfWork?.trim();
  if (saved) return saved;

  const fromTasks = uniqueTaskScopeLines(tasks);
  if (fromTasks.length > 0) {
    return fromTasks.map((line) => `✓ ${line}`).join("\n");
  }

  const excerpt = project.customerRequest?.trim();
  if (excerpt) {
    const short =
      excerpt.length > 420 ? `${excerpt.slice(0, 417).trim()}…` : excerpt;
    return `✓ ${short}`;
  }

  return DEFAULT_SCOPE_KEYS.map((key) => `✓ ${t(key)}`).join("\n");
}

export function buildDefaultConditionsText(t: (key: string) => string): string {
  return [
    t("quotes.print.conditions.validity"),
    t("quotes.print.conditions.execution"),
    t("quotes.print.conditions.scopeChange"),
    t("quotes.print.conditions.payment"),
  ].join("\n");
}

export function buildConditionsText(
  docMeta: QuoteDocumentMeta,
  t: (key: string) => string
): string {
  const saved = docMeta.conditions?.trim();
  if (saved) return saved;
  return buildDefaultConditionsText(t);
}

export type QuotePrintUserInfo = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export function resolveContactPerson(
  docMeta: QuoteDocumentMeta,
  user: QuotePrintUserInfo | null | undefined,
  organization: OrganizationPrintInfo | null
): QuoteContactPerson {
  const saved = docMeta.contactPerson;
  const orgEmail = organization?.profile?.email?.trim();
  const orgPhone = organization?.profile?.phone?.trim();

  return {
    name: saved?.name?.trim() || user?.name?.trim() || undefined,
    role: saved?.role?.trim() || undefined,
    phone: saved?.phone?.trim() || user?.phone?.trim() || orgPhone || undefined,
    email: saved?.email?.trim() || user?.email?.trim() || orgEmail || undefined,
  };
}

export function filterCustomerQuoteItems(
  quoteItems: QuoteDraftItemDoc[],
  materials: ReturnType<typeof resolveSetupMaterialRows>
): QuoteDraftItemDoc[] {
  const visibilityByQuoteId = new Map<string, boolean>();
  for (const row of materials) {
    if (row.quoteItemId) {
      visibilityByQuoteId.set(row.quoteItemId, row.customerVisible !== false);
    }
  }

  return quoteItems.filter((item) => {
    if (item.category === "work") return true;
    if (item.customerVisible === false) return false;
    const fromRow = item.id ? visibilityByQuoteId.get(item.id) : undefined;
    if (fromRow === false) return false;
    if (fromRow === true || item.customerVisible === true) return true;
    return isCustomerVisibleItemName(item.name);
  });
}

/** Sum material / work / other from quote line items (editor & saved quote doc). */
export function buildPriceSummaryFromQuote(quote: QuoteDoc): QuotePrintPriceSummary {
  const materialTotal = quote.items
    .filter((i) => normalizeQuotePrintCategory(i.category) === "material")
    .reduce((s, i) => s + i.total, 0);
  const workTotal = quote.items
    .filter((i) => normalizeQuotePrintCategory(i.category) === "work")
    .reduce((s, i) => s + i.total, 0);
  const otherTotal = quote.items
    .filter((i) => {
      const cat = normalizeQuotePrintCategory(i.category);
      return cat !== "material" && cat !== "work";
    })
    .reduce((s, i) => s + i.total, 0);
  const lineSubtotal = materialTotal + workTotal + otherTotal;
  const hasPricedLines = quote.items.some((i) => i.total > 0);
  const isFlatRate =
    !hasPricedLines && quote.grandTotal > 0 && quote.subtotal === 0;

  return {
    materialTotal,
    workTotal,
    otherTotal,
    netTotal: quote.subtotal > 0 ? quote.subtotal : lineSubtotal,
    vatPercent: quote.vatPercent,
    vatAmount: quote.vatAmount,
    grossTotal:
      quote.grandTotal > 0
        ? quote.grandTotal
        : Math.round((lineSubtotal + quote.vatAmount) * 100) / 100,
    isComplete: hasPricedLines || quote.grandTotal > 0,
    isFlatRate,
  };
}

/**
 * Saved quote lines trump frozen AI setup overrides when they disagree
 * (e.g. materialTotalOverride: 0 or old manual flat-rate gross).
 */
export function shouldPreferQuoteDocumentPricing(
  quote: QuoteDoc,
  setupTotals: AiSetupTotals
): boolean {
  const lineSubtotal = quote.items.reduce((sum, item) => sum + item.total, 0);
  if (lineSubtotal <= 0 || quote.grandTotal <= 0) return false;

  const materialFromLines = quote.items
    .filter((i) => normalizeQuotePrintCategory(i.category) === "material")
    .reduce((sum, i) => sum + i.total, 0);

  if (materialFromLines > 0 && setupTotals.materialCost < materialFromLines * 0.5) {
    return true;
  }
  if (setupTotals.manualTotalActive && quote.grandTotal > setupTotals.grossTotal * 1.2) {
    return true;
  }
  if (Math.abs(quote.grandTotal - setupTotals.grossTotal) > 1) {
    return true;
  }
  return false;
}

/** Fallback when only QuoteDoc is available (no project quoteItems subcollection). */
export function buildQuotePrintContextFromQuote(params: {
  quote: QuoteDoc;
  project: ProjectDoc | null;
  organization: OrganizationPrintInfo | null;
  user?: QuotePrintUserInfo | null;
  t: (key: string) => string;
}): QuotePrintContext {
  const { quote, project, organization, user, t } = params;
  const docMeta = parseQuoteDocumentMeta(project?.quoteDraftNotes);

  return {
    scopeOfWork: project
      ? buildScopeOfWorkText(project, [], docMeta, t)
      : docMeta.scopeOfWork?.trim() || "",
    conditions: buildConditionsText(docMeta, t),
    executionPeriod: docMeta.executionPeriod?.trim() || undefined,
    paymentTerms: docMeta.paymentTerms?.trim() || undefined,
    warranty: docMeta.warranty?.trim() || undefined,
    exclusions: docMeta.exclusions?.trim() || undefined,
    contactPerson: resolveContactPerson(docMeta, user, organization),
    priceSummary: buildPriceSummaryFromQuote(quote),
    currency: resolveQuoteCurrency({
      currency: quote.currency,
      countryCode: organization?.market?.countryCode ?? organization?.profile?.country,
    }),
    customerNumber: project?.customerId?.trim() || undefined,
    projectNumber: project?.id?.slice(0, 8).toUpperCase(),
  };
}

export function buildQuotePrintContext(params: {
  project: ProjectDoc;
  quote: QuoteDoc;
  quoteItems: QuoteDraftItemDoc[];
  tasks: TaskDoc[];
  suggestions?: MaterialSuggestionDoc[];
  organization: OrganizationPrintInfo | null;
  user?: QuotePrintUserInfo | null;
  t: (key: string) => string;
}): QuotePrintContext {
  const { project, quote, quoteItems, tasks, suggestions = [], organization, user, t } =
    params;
  const docMeta = parseQuoteDocumentMeta(project.quoteDraftNotes);
  const setupMeta = parseAiSetupMeta(project.quoteDraftNotes);
  const countryCode = organization?.market?.countryCode ?? organization?.profile?.country ?? null;
  const calc = resolveAiSetupCalculation(
    setupMeta?.calculation,
    project.quoteDraftVatPercent,
    countryCode
  );
  const materialRows = resolveSetupMaterialRows(quoteItems, suggestions, []);
  const work = setupMeta?.workEstimate ?? workEstimateFromQuoteItems(quoteItems, tasks);

  const visibleItems = filterCustomerQuoteItems(quoteItems, materialRows);
  const displayLines = buildProjectQuoteDisplayLines(
    project,
    visibleItems,
    tasks,
    suggestions
  ).filter((line) =>
    line.category === "work" ? true : isCustomerVisibleItemName(line.name)
  );

  const hasPricedLines =
    displayLines.some((l) => l.lineTotal > 0) || quote.items.some((i) => i.total > 0);
  const totals = computeAiSetupTotals(materialRows, work, calc);
  const quotePriceSummary = buildPriceSummaryFromQuote(quote);
  const useQuotePricing = shouldPreferQuoteDocumentPricing(quote, totals);

  const priceSummary: QuotePrintPriceSummary = useQuotePricing
    ? quotePriceSummary
    : {
        materialTotal: totals.materialCost,
        workTotal: totals.workCost,
        otherTotal: totals.otherCosts,
        netTotal: totals.netTotal,
        vatPercent: calc.vatPercent,
        vatAmount: totals.vatAmount,
        grossTotal: totals.grossTotal,
        isComplete: hasPricedLines || totals.manualTotalActive,
        isFlatRate:
          calc.manualGrossTotal != null && calc.manualGrossTotal >= 0 && !hasPricedLines,
      };

  return {
    scopeOfWork: buildScopeOfWorkText(project, tasks, docMeta, t),
    conditions: buildConditionsText(docMeta, t),
    executionPeriod: docMeta.executionPeriod?.trim() || undefined,
    paymentTerms: docMeta.paymentTerms?.trim() || undefined,
    warranty: docMeta.warranty?.trim() || undefined,
    exclusions: docMeta.exclusions?.trim() || undefined,
    contactPerson: resolveContactPerson(docMeta, user, organization),
    priceSummary,
    currency: resolveQuoteCurrency({
      currency: quote.currency,
      countryCode: organization?.market?.countryCode ?? organization?.profile?.country,
    }),
    customerNumber: project.customerId?.trim() || undefined,
    projectNumber: project.id?.slice(0, 8).toUpperCase(),
  };
}
