/** Feature flag: product sourcing / price assistance for AI setup. */

export function isProductSourcingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING === "1";
}
