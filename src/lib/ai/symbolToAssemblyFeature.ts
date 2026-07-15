/**
 * Symbol → Assembly → Product architecture feature flag.
 * Requires estimator flow; ON in production when estimator is on.
 */

import { isAiEstimatorFlowEnabled } from "./aiEstimatorFeature";

function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isAiSymbolLibraryEnabled(): boolean {
  if (!isAiEstimatorFlowEnabled()) return false;
  const flag = process.env.NEXT_PUBLIC_ENABLE_AI_SYMBOL_LIBRARY?.trim();
  if (flag === "1") return true;
  if (flag === "0") return !isProductionBuild();
  return isProductionBuild();
}
