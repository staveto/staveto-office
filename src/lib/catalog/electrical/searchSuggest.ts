import { normalizeCatalogName } from "./normalizeName";
import type { ElectricalCatalogProduct } from "./types";

export type ProductSearchHit = {
  product: ElectricalCatalogProduct;
  score: number;
};

/**
 * Rank products for typeahead / search. Pure — no I/O.
 */
export function searchElectricalProducts(
  products: ElectricalCatalogProduct[],
  query: string,
  opts?: { categoryId?: string | null; limit?: number }
): ProductSearchHit[] {
  const q = normalizeCatalogName(query);
  const limit = opts?.limit ?? 12;
  const categoryId = opts?.categoryId ?? null;

  let pool = products;
  if (categoryId) {
    pool = products.filter(
      (p) => p.categoryId === categoryId || p.categoryPathIds.includes(categoryId)
    );
  }

  if (!q) {
    return pool.slice(0, limit).map((product) => ({ product, score: 0 }));
  }

  const parts = q.split(" ").filter(Boolean);
  const hits: ProductSearchHit[] = [];

  for (const product of pool) {
    const name = product.normalizedName || normalizeCatalogName(product.name);
    const sku = normalizeCatalogName(product.supplierSku);
    const brand = normalizeCatalogName(product.brand ?? "");
    const series = normalizeCatalogName(product.series ?? "");
    const tokens = (product.searchTokens ?? []).join(" ");
    const hay = `${name} ${sku} ${brand} ${series} ${tokens}`;

    let score = 0;
    if (name.startsWith(q)) score += 100;
    else if (name.includes(q)) score += 60;
    if (sku && (sku === q || sku.includes(q))) score += 80;
    if (brand && brand.includes(q)) score += 25;
    if (series && series.includes(q)) score += 20;

    let allParts = true;
    for (const part of parts) {
      if (!hay.includes(part)) {
        allParts = false;
        break;
      }
      score += 8;
    }
    if (!allParts && score < 20) continue;
    if (score <= 0) continue;

    hits.push({ product, score });
  }

  hits.sort(
    (a, b) =>
      b.score - a.score || a.product.name.localeCompare(b.product.name, "sk")
  );
  return hits.slice(0, limit);
}

export function filterProductsByCategory(
  products: ElectricalCatalogProduct[],
  categoryId: string | null
): ElectricalCatalogProduct[] {
  if (!categoryId) return products;
  return products.filter(
    (p) => p.categoryId === categoryId || p.categoryPathIds.includes(categoryId)
  );
}
