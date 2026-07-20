import type { CatalogProduct } from "./types";

export type ProductValidationError =
  | "missing_name"
  | "invalid_package_quantity"
  | "price_field_forbidden";

export type ProductValidationResult =
  | { ok: true }
  | { ok: false; errors: ProductValidationError[] };

/**
 * CatalogProduct must not carry authoritative price fields.
 * packageQuantity must be > 0.
 */
export function validateCatalogProduct(
  product: CatalogProduct & { unitPrice?: unknown; price?: unknown; priceNet?: unknown }
): ProductValidationResult {
  const errors: ProductValidationError[] = [];

  if (!product.name?.trim()) errors.push("missing_name");
  if (!(product.packageQuantity > 0)) errors.push("invalid_package_quantity");

  if (
    "unitPrice" in product ||
    "price" in product ||
    "priceNet" in product
  ) {
    // Only flag if those keys exist with defined values on a loose object.
    const loose = product as Record<string, unknown>;
    if (
      loose.unitPrice !== undefined ||
      loose.price !== undefined ||
      loose.priceNet !== undefined
    ) {
      errors.push("price_field_forbidden");
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}
