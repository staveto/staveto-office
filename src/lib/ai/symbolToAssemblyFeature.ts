/**
 * Symbol → Assembly → Product architecture feature flag.
 * Requires estimator flow; defaults OFF until explicitly enabled.
 */

import { isAiEstimatorFlowEnabled } from "./aiEstimatorFeature";

export function isAiSymbolLibraryEnabled(): boolean {
  return (
    isAiEstimatorFlowEnabled() &&
    process.env.NEXT_PUBLIC_ENABLE_AI_SYMBOL_LIBRARY === "1"
  );
}
