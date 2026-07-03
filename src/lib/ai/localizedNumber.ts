/** Mirror of functions/src/localizedNumber.ts for the web app. */

const UNIT_SUFFIX_RE =
  /\s*(m²|m2|m\^2|sqm|㎡|ks|pcs|stk|kg|g|l|m³|m3|hod|h|mm|cm)\s*$/i;

function stripUnitSuffix(raw: string): string {
  return raw.replace(UNIT_SUFFIX_RE, "").trim();
}

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
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else if (parts.length === 2 && parts[1].length === 3) {
      s = `${parts[0]}${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      s = s.replace(/\./g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseAreaM2FromText(text: string): number | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  const match = normalized.match(
    /(\d[\d\s.,]*)\s*(?:m²|m2|m\^2|sqm|㎡)/i
  );
  if (!match) return undefined;
  const n = parseLocalizedNumber(match[1]);
  return n !== undefined && n > 0 ? n : undefined;
}

export function roundDocumentQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}
