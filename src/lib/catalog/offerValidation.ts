import type { SupplierOfferBase } from "./types";

export type OfferValidationError =
  | "missing_price"
  | "zero_as_missing"
  | "invalid_price_basis"
  | "invalid_package_quantity";

export type OfferValidationResult =
  | { ok: true }
  | { ok: false; errors: OfferValidationError[] };

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Validate a supplier offer.
 * - Missing price must use status "missing" — never encode as 0.
 * - At least one of priceNet / priceGross required unless status is missing.
 * - Public prices may use status "indicative" (allowed; not required for validity).
 */
export function validateSupplierOffer(
  offer: Pick<
    SupplierOfferBase,
    | "priceNet"
    | "priceGross"
    | "priceBasisQuantity"
    | "packageQuantity"
    | "status"
  >
): OfferValidationResult {
  const errors: OfferValidationError[] = [];

  if (!(offer.priceBasisQuantity > 0)) {
    errors.push("invalid_price_basis");
  }
  if (!(offer.packageQuantity > 0)) {
    errors.push("invalid_package_quantity");
  }

  const hasNet = isFiniteNumber(offer.priceNet);
  const hasGross = isFiniteNumber(offer.priceGross);

  if (offer.status === "missing") {
    // Missing must not be represented as literal zero prices.
    if (hasNet && offer.priceNet === 0) errors.push("zero_as_missing");
    if (hasGross && offer.priceGross === 0) errors.push("zero_as_missing");
  } else if (!hasNet && !hasGross) {
    errors.push("missing_price");
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Prefer marking public list prices as indicative in UI/import layers. */
export function isPublicPriceIndicative(
  offer: Pick<SupplierOfferBase, "priceType" | "status">
): boolean {
  return offer.priceType === "public" || offer.status === "indicative";
}
