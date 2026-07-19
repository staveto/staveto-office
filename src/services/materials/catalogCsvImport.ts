/**
 * CSV import for the own price list ("Vlastné položky").
 *
 * The user uploads their company's price list as CSV and it lands in
 * workspaces/{wsKey}/catalogItems — private to that workspace. Tolerant
 * parser for real-world Slovak price lists:
 *  - delimiter auto-detection (semicolon, tab, comma)
 *  - decimal comma prices ("1,45"), currency suffixes ("8,6 €"), "od 11"
 *  - Slovak unit aliases (ks, bm, hod, bal…)
 *  - optional header row and optional kind/description columns
 *
 * Import skips items whose name already exists (case-insensitive), so
 * re-importing the same file never duplicates.
 */

import { createCatalogItem, listCatalogItems } from "./catalogItemsService";
import type { CatalogItemKind } from "./catalogItemsService";
import type { MaterialUnit } from "./types";

export type ParsedCatalogRow = {
  name: string;
  unit: MaterialUnit;
  price: number;
  kind?: CatalogItemKind;
  description?: string;
  /** 1-based line number in the source file (for error reporting). */
  line: number;
};

export type ParseCatalogCsvResult = {
  rows: ParsedCatalogRow[];
  /** Human-readable problems, e.g. "riadok 7: chýba cena". */
  errors: string[];
};

const UNIT_ALIASES: Record<string, MaterialUnit> = {
  ks: "pcs",
  kus: "pcs",
  kusy: "pcs",
  pcs: "pcs",
  piece: "pcs",
  m: "m",
  bm: "m",
  meter: "m",
  m2: "m2",
  "m²": "m2",
  m3: "m3",
  "m³": "m3",
  cm: "cm",
  km: "km",
  kg: "kg",
  g: "g",
  l: "l",
  liter: "l",
  bal: "pack",
  balenie: "pack",
  pack: "pack",
  krabica: "box",
  box: "box",
  rolka: "roll",
  roll: "roll",
  hod: "hour",
  h: "hour",
  hodina: "hour",
  hour: "hour",
  sada: "set",
  set: "set",
  par: "pair",
  "pár": "pair",
  pair: "pair",
};

const KIND_ALIASES: Record<string, CatalogItemKind> = {
  praca: "work",
  "práca": "work",
  prace: "work",
  "práce": "work",
  work: "work",
  sluzba: "work",
  "služba": "work",
  produkt: "product",
  product: "product",
  material: "product",
  "materiál": "product",
  tovar: "product",
};

export function normalizeCatalogUnit(raw: string): MaterialUnit {
  const key = raw.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[key] ?? "other";
}

/** Parses "1,45", "8,6 €", "od 11", "17.5" → number; NaN when hopeless. */
export function parseCatalogPrice(raw: string): number {
  const cleaned = raw
    .toLowerCase()
    .replace(/od\s+/g, "")
    .replace(/[€$]|eur|czk|bez dph|s dph/g, "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10).join("\n");
  const counts: Array<[string, number]> = [
    [";", (sample.match(/;/g) ?? []).length],
    ["\t", (sample.match(/\t/g) ?? []).length],
    [",", (sample.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ";";
}

/** Minimal CSV field splitter with double-quote support. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

type ColumnMap = {
  name: number;
  unit: number;
  price: number;
  kind?: number;
  description?: number;
};

const HEADER_NAMES: Record<keyof ColumnMap, string[]> = {
  name: ["nazov", "názov", "polozka", "položka", "name", "item"],
  unit: ["jednotka", "mj", "unit", "jedn"],
  price: ["cena", "price", "cena bez dph", "jednotkova cena", "jednotková cena", "unit price"],
  kind: ["typ", "druh", "kind", "type"],
  description: ["popis", "poznamka", "poznámka", "description", "note", "kategoria", "kategória"],
};

function detectHeader(fields: string[]): ColumnMap | null {
  const lower = fields.map((f) => f.trim().toLowerCase());
  const find = (aliases: string[]) => {
    const idx = lower.findIndex((f) => aliases.includes(f));
    return idx >= 0 ? idx : undefined;
  };
  const name = find(HEADER_NAMES.name);
  const unit = find(HEADER_NAMES.unit);
  const price = find(HEADER_NAMES.price);
  if (name === undefined || unit === undefined || price === undefined) return null;
  return {
    name,
    unit,
    price,
    kind: find(HEADER_NAMES.kind),
    description: find(HEADER_NAMES.description),
  };
}

/**
 * Parse a price-list CSV. Without a header row the expected column order is:
 * name;unit;price[;kind][;description]
 */
export function parseCatalogCsv(text: string): ParseCatalogCsvResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/);
  const nonEmpty = lines
    .map((line, i) => ({ line, number: i + 1 }))
    .filter(({ line }) => line.trim().length > 0);

  if (nonEmpty.length === 0) return { rows: [], errors: [] };

  const delimiter = detectDelimiter(nonEmpty.map((l) => l.line));
  const firstFields = splitCsvLine(nonEmpty[0]!.line, delimiter);
  const headerMap = detectHeader(firstFields);
  const dataLines = headerMap ? nonEmpty.slice(1) : nonEmpty;
  const columns: ColumnMap = headerMap ?? { name: 0, unit: 1, price: 2, kind: 3, description: 4 };

  const rows: ParsedCatalogRow[] = [];
  const errors: string[] = [];

  for (const { line, number } of dataLines) {
    const fields = splitCsvLine(line, delimiter);
    const name = (fields[columns.name] ?? "").trim();
    const unitRaw = (fields[columns.unit] ?? "").trim();
    const priceRaw = (fields[columns.price] ?? "").trim();

    if (!name) {
      errors.push(`${number}: missing name`);
      continue;
    }
    // Section headings in exported price lists often have only the name cell.
    if (!unitRaw && !priceRaw) {
      continue;
    }
    const price = parseCatalogPrice(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`${number}: invalid price "${priceRaw}"`);
      continue;
    }

    const kindRaw =
      columns.kind !== undefined ? (fields[columns.kind] ?? "").trim().toLowerCase() : "";
    const description =
      columns.description !== undefined ? (fields[columns.description] ?? "").trim() : "";

    rows.push({
      name,
      unit: normalizeCatalogUnit(unitRaw),
      price,
      kind: KIND_ALIASES[kindRaw],
      description: description || undefined,
      line: number,
    });
  }

  return { rows, errors };
}

export type ImportCatalogCsvResult = {
  created: number;
  /** Rows skipped because a same-named item already exists. */
  skipped: number;
};

/**
 * Insert parsed rows into the workspace catalog. Rows without an explicit
 * kind column get `defaultKind`. Existing same-named items are kept
 * untouched and skipped.
 */
export async function importParsedCatalogRows(
  workspaceKey: string,
  userId: string,
  rows: ParsedCatalogRow[],
  defaultKind: CatalogItemKind
): Promise<ImportCatalogCsvResult> {
  const existing = await listCatalogItems(workspaceKey);
  const existingNames = new Set(existing.map((i) => i.name.trim().toLowerCase()));

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const nameKey = row.name.trim().toLowerCase();
    if (existingNames.has(nameKey)) {
      skipped++;
      continue;
    }
    await createCatalogItem(workspaceKey, userId, {
      kind: row.kind ?? defaultKind,
      name: row.name,
      description: row.description,
      unit: row.unit,
      unitPrice: row.price,
    });
    existingNames.add(nameKey);
    created++;
  }
  return { created, skipped };
}

/** Sample file offered for download in the import dialog. */
export const CATALOG_CSV_SAMPLE = [
  "nazov;jednotka;cena;typ;popis",
  "Zásuvka 230V premium;ks;4,50;produkt;Biela, rámik v cene",
  "Zapojenie zásuvky 2+PE;ks;3,50;praca;Kompletáž",
  "Ťahanie kábla CYKY do 6mm;bm;0,70;praca;Hrubá montáž",
  "Základná hodinová sadzba;hod;15;praca;",
].join("\n");
