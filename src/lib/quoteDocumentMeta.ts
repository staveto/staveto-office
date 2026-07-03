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
} from "@/components/projects/setup/aiSetupHelpers";
import { resolveQuoteCurrency } from "@/lib/workspace/countryConfig";
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
  const hasPricedLines = quote.items.some((item) => item.total > 0);
  const isFlatRate = quote.grandTotal > 0 && quote.subtotal === 0 && !hasPricedLines;

  const materialTotal = quote.items
    .filter((i) => i.category === "material")
    .reduce((s, i) => s + i.total, 0);
  const workTotal = quote.items
    .filter((i) => i.category === "work")
    .reduce((s, i) => s + i.total, 0);
  const otherTotal = quote.items
    .filter((i) => i.category !== "material" && i.category !== "work")
    .reduce((s, i) => s + i.total, 0);

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
    priceSummary: {
      materialTotal,
      workTotal,
      otherTotal,
      netTotal: quote.subtotal,
      vatPercent: quote.vatPercent,
      vatAmount: quote.vatAmount,
      grossTotal: quote.grandTotal,
      isComplete: hasPricedLines || quote.grandTotal > 0,
      isFlatRate,
    },
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
  const totals = computeAiSetupTotals(materialRows, work, calc);

  const visibleItems = filterCustomerQuoteItems(quoteItems, materialRows);
  const displayLines = buildProjectQuoteDisplayLines(
    project,
    visibleItems,
    tasks,
    suggestions
  ).filter((line) =>
    line.category === "work" ? true : isCustomerVisibleItemName(line.name)
  );

  const hasPricedLines = displayLines.some((l) => l.lineTotal > 0);
  const isFlatRate = calc.manualGrossTotal != null && calc.manualGrossTotal >= 0;
  const isComplete = hasPricedLines || isFlatRate;

  return {
    scopeOfWork: buildScopeOfWorkText(project, tasks, docMeta, t),
    conditions: buildConditionsText(docMeta, t),
    executionPeriod: docMeta.executionPeriod?.trim() || undefined,
    paymentTerms: docMeta.paymentTerms?.trim() || undefined,
    warranty: docMeta.warranty?.trim() || undefined,
    exclusions: docMeta.exclusions?.trim() || undefined,
    contactPerson: resolveContactPerson(docMeta, user, organization),
    priceSummary: {
      materialTotal: totals.materialCost,
      workTotal: totals.workCost,
      otherTotal: totals.otherCosts,
      netTotal: totals.netTotal,
      vatPercent: calc.vatPercent,
      vatAmount: totals.vatAmount,
      grossTotal: totals.grossTotal,
      isComplete,
      isFlatRate,
    },
    currency: resolveQuoteCurrency({
      currency: quote.currency,
      countryCode: organization?.market?.countryCode ?? organization?.profile?.country,
    }),
    customerNumber: project.customerId?.trim() || undefined,
    projectNumber: project.id?.slice(0, 8).toUpperCase(),
  };
}
