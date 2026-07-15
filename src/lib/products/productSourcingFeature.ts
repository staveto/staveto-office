/** Feature flag: product sourcing / price assistance for AI setup. */

function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isProductSourcingEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ENABLE_PRODUCT_SOURCING?.trim();
  if (flag === "1") return true;
  if (flag === "0") return !isProductionBuild();
  return isProductionBuild();
}
