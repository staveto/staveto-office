/**
 * Parse numbers from construction documents (SK/CZ/DE/CH use comma decimals).
 * Always prefer the printed text — never guess extra digits.
 */

const UNIT_SUFFIX_RE =
  /\s*(m²|m2|m\^2|sqm|㎡|ks|pcs|stk|kg|g|l|m³|m3|hod|h|mm|cm)\s*$/i;

function stripUnitSuffix(raw: string): string {
  return raw.replace(UNIT_SUFFIX_RE, "").trim();
}

/**
 * Parse a localized number from document text or AI JSON (string or number).
 * Examples:
 * - "12,5" → 12.5
 * - "1.234,56" → 1234.56
 * - "1,234.56" → 1234.56
 * - "24.3" → 24.3
 * - "1 234,5" → 1234.5
 */
export function parseLocalizedNumber(
  raw: string | number | null | undefined
): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : undefined;
  }

  let s = stripUnitSuffix(String(raw).trim());
  if (!s) return undefined;

  s = s.replace(/\u00a0/g, " ").replace(/\s/g, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // European: 1.234,56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,234.56
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      // Decimal comma: 12,5 or 12,50
      s = `${parts[0]}.${parts[1]}`;
    } else if (parts.length === 2 && parts[1].length === 3) {
      // Thousands comma: 12,500 → 12500
      s = `${parts[0]}${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      // Decimal dot: 12.5
      s = `${parts[0]}.${parts[1]}`;
    } else if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // Thousand dots: 1.234 or 12.345.678
      s = s.replace(/\./g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Extract first area in m² from free text like "Plocha: 24,3 m²". */
export function parseAreaM2FromText(text: string): number | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /(\d[\d\s.,]*)\s*(?:m²|m2|m\^2|sqm|㎡)/i
  );
  if (!match) return undefined;
  const n = parseLocalizedNumber(match[1]);
  return n !== undefined && n > 0 ? n : undefined;
}

/** Round to 2 decimals for areas/quantities stored in Firestore. */
export function roundDocumentQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseLocalizedNumberOrNull(
  raw: string | number | null | undefined
): number | null {
  const n = parseLocalizedNumber(raw);
  return n === undefined ? null : roundDocumentQuantity(n);
}
