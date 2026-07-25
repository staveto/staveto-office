import type {
  ElectricalCatalogCategory,
  ElectricalCatalogProduct,
} from "./types";

/**
 * Top-level BUCO categories that belong to cable routing / tracing
 * ("trasovacie" materials measured in meters on the plan).
 */
export const ROUTING_TOP_CATEGORY_SLUGS = [
  "kable-a-vodice",
  "rurky-listy-a-kablove-trasy",
] as const;

export type RoutingTopCategorySlug = (typeof ROUTING_TOP_CATEGORY_SLUGS)[number];

/** Level-0 category ids for the routing slugs present in this catalog. */
export function routingTopCategoryIds(
  categories: ElectricalCatalogCategory[]
): Set<string> {
  const allowed = new Set<string>(ROUTING_TOP_CATEGORY_SLUGS);
  return new Set(
    categories
      .filter((c) => c.level === 0 && allowed.has(c.slug))
      .map((c) => c.id)
  );
}

/** True when the product sits under a routing top category. */
export function isRoutingElectricalProduct(
  product: Pick<ElectricalCatalogProduct, "categoryPathIds">,
  routingTopIds: Set<string>
): boolean {
  if (routingTopIds.size === 0) return false;
  return product.categoryPathIds.some((id) => routingTopIds.has(id));
}

export function filterRoutingElectricalProducts(
  products: ElectricalCatalogProduct[],
  categories: ElectricalCatalogCategory[]
): ElectricalCatalogProduct[] {
  const topIds = routingTopCategoryIds(categories);
  if (topIds.size === 0) return [];
  return products.filter((p) => isRoutingElectricalProduct(p, topIds));
}
