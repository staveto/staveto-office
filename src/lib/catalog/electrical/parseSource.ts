import { readFileSync } from "node:fs";
import type { BucoRawProduct, BucoScraperState } from "./types";

export type ParsedBucoSource = {
  products: BucoRawProduct[];
  categoryCount: number;
  format: "scraper_state" | "jsonl" | "nested_tree";
};

type NestedTreeProduct = {
  nazov?: string;
  kod?: string;
  cena_s_dph?: string;
  cena_bez_dph?: string;
  sklad?: string;
  sklad_ks?: string;
  obrazok_url?: string;
  url?: string;
};

type NestedTreeNode = {
  nazov?: string;
  url?: string;
  pocet_produktov_priamo?: number;
  produkty?: NestedTreeProduct[];
  podkategorie?: NestedTreeNode[];
};

/**
 * Parse BUCO source:
 * - nested tree JSON (array of category → podkategorie → produkty)
 * - scraper_state JSON ({visited,tree,products})
 * - JSONL (one category row per line with nested produkty[])
 */
export function parseBucoSourceFile(filePath: string): ParsedBucoSource {
  const raw = readFileSync(filePath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) {
    return { products: [], categoryCount: 0, format: "scraper_state" };
  }

  // Nested category tree: [ { nazov, produkty, podkategorie } ]
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as unknown;
    if (Array.isArray(arr) && looksLikeNestedTree(arr)) {
      return parseNestedTree(arr as NestedTreeNode[]);
    }
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

function looksLikeNestedTree(arr: unknown[]): boolean {
  if (arr.length === 0) return false;
  const first = arr[0];
  if (!first || typeof first !== "object") return false;
  const node = first as NestedTreeNode;
  return (
    typeof node.nazov === "string" &&
    (Array.isArray(node.produkty) || Array.isArray(node.podkategorie))
  );
}

/**
 * Walk nested BUCO tree. Same product (kod / url) kept once; deepest category
 * becomes primary, all memberships kept in sourceCategoryPaths.
 */
export function parseNestedTree(roots: NestedTreeNode[]): ParsedBucoSource {
  type Acc = {
    product: BucoRawProduct;
    depth: number;
    paths: Set<string>;
  };
  const byKey = new Map<string, Acc>();
  let categoryCount = 0;

  const walk = (node: NestedTreeNode, breadcrumb: string[]) => {
    const name = (node.nazov ?? "").trim();
    const pathNames = name ? [...breadcrumb, name] : [...breadcrumb];
    categoryCount += 1;
    const pathKey = pathNames.join(" › ");
    const depth = pathNames.length;

    for (const prod of node.produkty ?? []) {
      const url = (prod.url ?? "").trim();
      if (!url) continue;
      const kod = String(prod.kod ?? "").trim();
      const dedupeKey = kod
        ? `kod:${kod.toLowerCase()}`
        : `url:${url.toLowerCase()}`;

      const next: BucoRawProduct = {
        nazov: prod.nazov,
        kod: kod || undefined,
        cena_s_dph: prod.cena_s_dph,
        cena_bez_dph: prod.cena_bez_dph,
        sklad: prod.sklad_ks ?? prod.sklad,
        obrazok_url: prod.obrazok_url?.trim() || undefined,
        url,
        sourceCategoryPath: pathKey || undefined,
        sourceCategoryName: name || pathNames[pathNames.length - 1],
        cesta: pathNames.length ? pathNames : undefined,
      };

      const prev = byKey.get(dedupeKey);
      if (!prev) {
        byKey.set(dedupeKey, {
          product: next,
          depth,
          paths: new Set(pathKey ? [pathKey] : []),
        });
        continue;
      }

      prev.paths.add(pathKey);
      // Prefer deeper category as primary placement.
      if (depth > prev.depth) {
        prev.depth = depth;
        prev.product = {
          ...prev.product,
          ...next,
          // Keep richer image / name if the deeper node omitted them.
          obrazok_url: next.obrazok_url || prev.product.obrazok_url,
          nazov: next.nazov || prev.product.nazov,
          cena_s_dph: next.cena_s_dph || prev.product.cena_s_dph,
          cena_bez_dph: next.cena_bez_dph || prev.product.cena_bez_dph,
          sklad: next.sklad || prev.product.sklad,
        };
      } else {
        if (!prev.product.obrazok_url && next.obrazok_url) {
          prev.product.obrazok_url = next.obrazok_url;
        }
        if (!prev.product.cena_s_dph && next.cena_s_dph) {
          prev.product.cena_s_dph = next.cena_s_dph;
        }
        if (!prev.product.cena_bez_dph && next.cena_bez_dph) {
          prev.product.cena_bez_dph = next.cena_bez_dph;
        }
      }
    }

    for (const child of node.podkategorie ?? []) {
      walk(child, pathNames);
    }
  };

  for (const root of roots) {
    walk(root, []);
  }

  const products = [...byKey.values()].map(({ product, paths }) => {
    const all = [...paths];
    const primary = product.sourceCategoryPath;
    const ordered = primary
      ? [primary, ...all.filter((p) => p !== primary)]
      : all;
    return {
      ...product,
      sourceCategoryPaths: ordered.length ? ordered : undefined,
    };
  });

  return {
    products,
    categoryCount,
    format: "nested_tree",
  };
}

function parseScraperState(state: BucoScraperState): ParsedBucoSource {
  const urlToCategory = new Map<string, { path: string; name: string }>();
  for (const [path, node] of Object.entries(state.tree ?? {})) {
    if (!node) continue;
    const name = (node.nazov || node.name || "").trim();
    for (const productUrl of node.products ?? []) {
      if (!productUrl) continue;
      urlToCategory.set(productUrl, { path, name });
    }
  }

  const products: BucoRawProduct[] = [];
  for (const [url, p] of Object.entries(state.products ?? {})) {
    if (!p) continue;
    const productUrl = p.url || url;
    const cat = urlToCategory.get(productUrl);
    products.push({
      ...p,
      url: productUrl,
      obrazok_url: p.obrazok_url,
      sourceCategoryPath: p.sourceCategoryPath ?? cat?.path,
      sourceCategoryName: p.sourceCategoryName ?? cat?.name,
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
        sklad_ks?: string;
        obrazok_url?: string;
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
        sklad: prod.sklad_ks ?? prod.sklad,
        obrazok_url: prod.obrazok_url,
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
