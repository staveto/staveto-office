import { readFileSync } from "node:fs";
import type { BucoRawProduct, BucoScraperState } from "./types";

export type ParsedBucoSource = {
  products: BucoRawProduct[];
  categoryCount: number;
  format: "scraper_state" | "jsonl";
};

/**
 * Parse BUCO source: scraper_state JSON ({visited,tree,products}) or JSONL
 * (one category row per line with nested produkty[]).
 */
export function parseBucoSourceFile(filePath: string): ParsedBucoSource {
  const raw = readFileSync(filePath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) {
    return { products: [], categoryCount: 0, format: "scraper_state" };
  }

  if (trimmed.startsWith("{") && !trimmed.includes("\n{")) {
    // Single JSON object (scraper state) — may be pretty-printed
    try {
      const obj = JSON.parse(trimmed) as BucoScraperState;
      if (obj.products && typeof obj.products === "object") {
        return parseScraperState(obj);
      }
    } catch {
      /* fall through to JSONL */
    }
  }

  // Heuristic: JSONL if multiple lines each starting with {
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 1 && lines.every((l) => l.trim().startsWith("{"))) {
    return parseJsonl(lines);
  }

  // Compact single-line scraper state
  const obj = JSON.parse(trimmed) as BucoScraperState;
  return parseScraperState(obj);
}

function parseScraperState(state: BucoScraperState): ParsedBucoSource {
  const products: BucoRawProduct[] = [];
  for (const [url, p] of Object.entries(state.products ?? {})) {
    if (!p) continue;
    products.push({
      ...p,
      url: p.url || url,
    });
  }
  return {
    products,
    categoryCount: Object.keys(state.tree ?? {}).length,
    format: "scraper_state",
  };
}

function parseJsonl(lines: string[]): ParsedBucoSource {
  const byUrl = new Map<string, BucoRawProduct>();
  let categoryCount = 0;

  for (const line of lines) {
    let row: {
      kategoria_path?: string;
      kategoria_nazov?: string;
      produkty?: Array<{
        nazov?: string;
        kod?: string;
        cena_s_dph?: string;
        cena_bez_dph?: string;
        sklad?: string;
        url?: string;
        cesta?: string[];
      }>;
    };
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    categoryCount += 1;
    for (const prod of row.produkty ?? []) {
      if (!prod?.url) continue;
      byUrl.set(prod.url, {
        nazov: prod.nazov,
        kod: prod.kod,
        cena_s_dph: prod.cena_s_dph,
        cena_bez_dph: prod.cena_bez_dph,
        sklad: prod.sklad,
        url: prod.url,
        sourceCategoryPath: row.kategoria_path,
        sourceCategoryName: row.kategoria_nazov,
        cesta: prod.cesta,
      });
    }
  }

  return {
    products: [...byUrl.values()],
    categoryCount,
    format: "jsonl",
  };
}
