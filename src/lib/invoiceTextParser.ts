/**
 * Lightweight invoice text parser for the web app.
 *
 * The OCR Cloud Function (`extractInvoiceDataFromStorage`) only returns the raw
 * extracted text — all structured parsing happens client-side. The mobile app
 * uses a large multilingual semantic mapper; this is a focused, self-contained
 * port of the most reliable heuristics (amount, VAT, supplier, invoice number,
 * date, currency) sufficient to pre-fill the expense review form. Unknown
 * fields return `null` so the user simply fills them in manually.
 */

export type ParsedInvoiceFields = {
  supplierName: string | null;
  supplierIco: string | null;
  invoiceNumber: string | null;
  issueDate: string | null; // ISO yyyy-mm-dd
  totalAmount: number | null;
  vatAmount: number | null;
  currency: string; // EUR | CZK | CHF | USD
};

const MAX_REASONABLE = 999_999.99;

/** Parse money value from various formats (65,19 / 65.19 / "1.234,56 EUR"). */
export function parseMoneyToNumber(v: unknown): number | null {
  if (v == null) return null;
  const raw = String(v)
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/EUR/gi, "")
    .replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  let normalized = raw;
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");
  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(",", "."); // 1.234,56 -> 1234.56
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(",", "."); // 65,19 -> 65.19
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Highest priority: "uhradené" / "platené v hotovosti" = final paid amount (SK invoices). */
function extractPaidAmount(rawText: string): number | null {
  const block = rawText.replace(/\s+/g, " ");
  const paidRegex =
    /(?:uhraden[ée]|platen[ée](?:\s+v\s+hotovosti)?)\s*(\d{1,6}[.,]\d{2})\s*(?:eur|€|euro)?/gi;
  let lastMatch: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((lastMatch = paidRegex.exec(block)) !== null) last = lastMatch;
  if (last?.[1]) {
    const n = parseMoneyToNumber(last[1]);
    if (n != null && n > 0 && n <= MAX_REASONABLE) return n;
  }
  return null;
}

/** Extract total WITH VAT from raw OCR text (multi-language). Excludes "Základ" (base). */
export function extractTotalFromRawText(rawText: string | null | undefined): number | null {
  if (!rawText || typeof rawText !== "string") return null;
  const fromPaid = extractPaidAmount(rawText);
  if (fromPaid != null) return fromPaid;
  const totalWithVatRegex =
    /(?:spolu(?:\s+v\s+eur)?|uhraden[ée]|platen[ée](?:\s+v\s+hotovosti)?|na\s*[úu]hradu\s*(?:eur)?|celkom|total|summe|gesamt|totale|importe|razem|hotovosť|karta|platba|k\s*[úu]hrade|paid|bezahlt|pagato|betrag|amount|montant|importo)[\s\S]*?(\d{1,6}[.,]\d{2})\s*(?:eur|€|euro)?/i;
  const m = rawText.match(totalWithVatRegex);
  if (m?.[1]) {
    const n = parseMoneyToNumber(m[1]);
    if (n != null && n > 0 && n <= MAX_REASONABLE) return n;
  }
  const baseOnlyRegex = /(?:základ|base|netto)\s*[:]?\s*(\d{1,6}[.,]\d{2})/gi;
  const avoid = new Set<number>();
  let baseMatch: RegExpExecArray | null;
  while ((baseMatch = baseOnlyRegex.exec(rawText)) !== null) {
    const b = parseMoneyToNumber(baseMatch[1]);
    if (b != null) avoid.add(b);
  }
  const fallbackPatterns = [/(?:eur|€)\s*(\d{1,6}[.,]\d{2})/gi, /(\d{1,6}[.,]\d{2})\s*(?:eur|€)/gi];
  for (const re of fallbackPatterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(rawText)) !== null) {
      const n = parseMoneyToNumber(match[1]);
      if (n != null && n > 0 && n <= MAX_REASONABLE && !avoid.has(n)) return n;
    }
  }
  return null;
}

/** VAT / DPH / MwSt amount. */
function extractVatAmount(rawText: string): number | null {
  const re =
    /(?:dph|vat|mwst|ust|t\.v\.a|tva|iva)\b[\s\S]{0,24}?(\d{1,6}[.,]\d{2})\s*(?:eur|€)?/i;
  const m = rawText.match(re);
  if (m?.[1]) {
    const n = parseMoneyToNumber(m[1]);
    if (n != null && n > 0 && n <= MAX_REASONABLE) return n;
  }
  return null;
}

const CURRENCY_PATTERNS: Array<{ currency: string; re: RegExp }> = [
  { currency: "EUR", re: /€|\beur\b|euro/i },
  { currency: "CZK", re: /\bczk\b|\bkč\b|\bkc\b/i },
  { currency: "CHF", re: /\bchf\b|\bsfr\b/i },
  { currency: "USD", re: /\$|\busd\b/i },
];

function detectCurrency(rawText: string): string {
  for (const { currency, re } of CURRENCY_PATTERNS) {
    if (re.test(rawText)) return currency;
  }
  return "EUR";
}

/** SK/CZ company registration id (IČO): 8 digits after the keyword. */
function extractIco(rawText: string): string | null {
  const re = /(?:i[čc]o)\s*[:\s]*([0-9]{8})\b/i;
  const m = rawText.match(re);
  return m?.[1] ?? null;
}

/** Invoice / document number. */
function extractInvoiceNumber(rawText: string): string | null {
  const patterns = [
    /(?:faktúra|faktura|invoice|rechnung|facture|factura|fattura)\s*(?:č\.?|c\.?|nr\.?|no\.?|number|n°|#)\s*[:\s]*([A-Za-z0-9][A-Za-z0-9/\-]{1,30})/i,
    /(?:číslo\s*faktúry|cislo\s*faktury|invoice\s*number|rechnungsnummer)\s*[:\s]*([A-Za-z0-9][A-Za-z0-9/\-]{1,30})/i,
    /(?:variabilný\s*symbol|variabilny\s*symbol|var\.?\s*symbol|\bvs\b)\s*[:\s]*([0-9]{2,20})/i,
  ];
  for (const re of patterns) {
    const m = rawText.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/** Normalize a date token to ISO yyyy-mm-dd; returns null when out of plausible range. */
function normalizeDate(day: number, month: number, year: number): string | null {
  let y = year;
  if (y < 100) y += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (y < 2000 || y > 2100) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Prefer a date near an "issue date" keyword, else the first plausible date. */
function extractIssueDate(rawText: string): string | null {
  const dmY = /\b(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{2,4})\b/g;
  const yMd = /\b(\d{4})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{1,2})\b/g;

  const keyword =
    /(?:dátum\s*vystavenia|datum\s*vystavenia|datum\s*vyhotovenia|issue\s*date|date\s*of\s*issue|rechnungsdatum|datum|date|dátum)/i;
  const kwIdx = rawText.search(keyword);
  const searchWindows: string[] = [];
  if (kwIdx >= 0) searchWindows.push(rawText.slice(kwIdx, kwIdx + 60));
  searchWindows.push(rawText);

  for (const window of searchWindows) {
    dmY.lastIndex = 0;
    const m1 = dmY.exec(window);
    if (m1) {
      const iso = normalizeDate(Number(m1[1]), Number(m1[2]), Number(m1[3]));
      if (iso) return iso;
    }
    yMd.lastIndex = 0;
    const m2 = yMd.exec(window);
    if (m2) {
      const iso = normalizeDate(Number(m2[3]), Number(m2[2]), Number(m2[1]));
      if (iso) return iso;
    }
  }
  return null;
}

const SUPPLIER_LEGAL_FORMS =
  /\b(s\.?\s?r\.?\s?o\.?|a\.?\s?s\.?|spol\.?\s*s\s*r\.?\s?o\.?|k\.?\s?s\.?|gmbh|ag|ug|kg|ohg|ltd\.?|llc|inc\.?|s\.?p\.?a\.?|s\.?a\.?|b\.?v\.?|sp\.?\s*z\s*o\.?\s?o\.?)\b/i;

/** Supplier name: first line containing a legal form, else first meaningful line. */
function extractSupplierName(rawText: string): string | null {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 80);

  for (const line of lines.slice(0, 15)) {
    if (SUPPLIER_LEGAL_FORMS.test(line) && /[A-Za-zÀ-ž]/.test(line)) {
      return line.replace(/\s{2,}/g, " ").slice(0, 120);
    }
  }
  // Fallback: first line that looks like a name (letters, not a label/number row).
  for (const line of lines.slice(0, 8)) {
    if (
      /[A-Za-zÀ-ž]{3,}/.test(line) &&
      !/(faktúra|faktura|invoice|rechnung|dátum|datum|date|i[čc]o|dič|ic\s*dph|vat|číslo|cislo|var)/i.test(line) &&
      !/^\d/.test(line)
    ) {
      return line.replace(/\s{2,}/g, " ").slice(0, 120);
    }
  }
  return null;
}

/** Parse OCR raw text into structured invoice fields (best-effort). */
export function parseInvoiceText(rawText: string | null | undefined): ParsedInvoiceFields {
  const text = typeof rawText === "string" ? rawText : "";
  if (!text.trim()) {
    return {
      supplierName: null,
      supplierIco: null,
      invoiceNumber: null,
      issueDate: null,
      totalAmount: null,
      vatAmount: null,
      currency: "EUR",
    };
  }
  return {
    supplierName: extractSupplierName(text),
    supplierIco: extractIco(text),
    invoiceNumber: extractInvoiceNumber(text),
    issueDate: extractIssueDate(text),
    totalAmount: extractTotalFromRawText(text),
    vatAmount: extractVatAmount(text),
    currency: detectCurrency(text),
  };
}
