/**
 * Client read for Phase 1 electrical catalog (catalogCategories / catalogProducts).
 * Writes are Admin-only (importer).
 */

import {
  getFirestoreInstance,
  collection,
  getDocs,
  query,
  where,
} from "@/lib/firebase";
import type {
  ElectricalCatalogCategory,
  ElectricalCatalogProduct,
} from "@/lib/catalog/electrical/types";
import { resolveCatalogProductImageUrl } from "@/lib/catalog/electrical/images";
import { ELECTRICAL_TRADE_ID } from "@/lib/catalog/electrical/category-rules";

function requireDb() {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  return db;
}

let categoriesCache: { tradeId: string; items: ElectricalCatalogCategory[] } | null =
  null;
let productsCache: { tradeId: string; items: ElectricalCatalogProduct[] } | null = null;

export function clearElectricalCatalogCache() {
  categoriesCache = null;
  productsCache = null;
}

export async function listElectricalCatalogCategories(
  tradeId: string = ELECTRICAL_TRADE_ID
): Promise<ElectricalCatalogCategory[]> {
  if (categoriesCache?.tradeId === tradeId) return categoriesCache.items;
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, "catalogCategories"), where("tradeId", "==", tradeId))
  );
  const items = snap.docs.map((d) => ({
    ...(d.data() as ElectricalCatalogCategory),
    id: d.id,
  }));
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "sk"));
  categoriesCache = { tradeId, items };
  return items;
}

export async function listElectricalCatalogProducts(
  tradeId: string = ELECTRICAL_TRADE_ID
): Promise<ElectricalCatalogProduct[]> {
  if (productsCache?.tradeId === tradeId) return productsCache.items;
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, "catalogProducts"), where("tradeId", "==", tradeId))
  );
  const items = snap.docs
    .map((d) => {
      const raw = { ...(d.data() as ElectricalCatalogProduct), id: d.id };
      return {
        ...raw,
        // Older docs / partial imports may omit imageUrl — derive from SKU.
        imageUrl: resolveCatalogProductImageUrl(raw),
      };
    })
    .filter((p) => p.status !== "rejected");
  items.sort((a, b) => a.name.localeCompare(b.name, "sk"));
  productsCache = { tradeId, items };
  return items;
}

export async function loadElectricalCatalog(tradeId: string = ELECTRICAL_TRADE_ID): Promise<{
  categories: ElectricalCatalogCategory[];
  products: ElectricalCatalogProduct[];
}> {
  const [categories, products] = await Promise.all([
    listElectricalCatalogCategories(tradeId),
    listElectricalCatalogProducts(tradeId),
  ]);
  return { categories, products };
}

/** Quote unit price in EUR major units (prefer net / without VAT). */
export function productUnitPriceEur(product: ElectricalCatalogProduct): number {
  const cents = product.pricing.netCents ?? product.pricing.grossCents;
  if (cents == null || !Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}
