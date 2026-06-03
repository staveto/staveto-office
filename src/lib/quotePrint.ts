import type { QuoteDoc, QuoteItemLine } from "./quotes";

export type QuotePrintItemCategory = "material" | "work" | "transport" | "other";

const CATEGORY_ORDER: QuotePrintItemCategory[] = [
  "material",
  "work",
  "transport",
  "other",
];

export function normalizeQuotePrintCategory(
  category?: string
): QuotePrintItemCategory {
  if (category === "material" || category === "work" || category === "transport") {
    return category;
  }
  return "other";
}

export function groupQuoteItemsByCategory(
  items: QuoteItemLine[]
): Record<QuotePrintItemCategory, QuoteItemLine[]> {
  const groups: Record<QuotePrintItemCategory, QuoteItemLine[]> = {
    material: [],
    work: [],
    transport: [],
    other: [],
  };

  for (const item of items) {
    groups[normalizeQuotePrintCategory(item.category)].push(item);
  }

  return groups;
}

export function getQuotePrintCategories(
  items: QuoteItemLine[]
): QuotePrintItemCategory[] {
  const groups = groupQuoteItemsByCategory(items);
  return CATEGORY_ORDER.filter((cat) => groups[cat].length > 0);
}

export function formatQuoteNumber(quote: QuoteDoc): string {
  const shortId = quote.id.slice(0, 8).toUpperCase();
  const year = getQuoteIssueDate(quote).getFullYear();
  return `CP-${year}-${shortId}`;
}

export function getQuoteIssueDate(quote: QuoteDoc): Date {
  const raw = quote.updatedAt || quote.createdAt;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function getQuoteValidUntilDate(quote: QuoteDoc, validDays = 14): Date {
  const issue = getQuoteIssueDate(quote);
  const valid = new Date(issue);
  valid.setDate(valid.getDate() + validDays);
  return valid;
}

export function formatQuotePrintDate(date: Date, locale = "sk-SK"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatQuoteQty(qty: number): string {
  return new Intl.NumberFormat("sk-SK", {
    maximumFractionDigits: 2,
    minimumFractionDigits: qty % 1 === 0 ? 0 : 2,
  }).format(qty);
}
