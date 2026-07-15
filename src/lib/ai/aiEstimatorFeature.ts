/**
 * Feature flags for the AI Estimator / quote-first flow.
 * When disabled, the existing generateProjectDraft path is used unchanged.
 *
 * Production (app.staveto.com) ships AI features ON so users always see the
 * latest estimator UI. Dev/local can opt out via NEXT_PUBLIC_ENABLE_* = 0.
 * Emergency kill switch: NEXT_PUBLIC_FORCE_DISABLE_AI_FEATURES=1
 */

function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}

function isEmergencyAiKillSwitch(): boolean {
  return process.env.NEXT_PUBLIC_FORCE_DISABLE_AI_FEATURES === "1";
}

/** True when flag is explicitly enabled, or production default applies. */
function isFeatureEnabled(flag: string | undefined, productionDefault = true): boolean {
  const value = flag?.trim();
  if (value === "1") return true;
  if (value === "0") return !isProductionBuild() ? false : productionDefault;
  return isProductionBuild() ? productionDefault : false;
}

export function isAiEstimatorFlowEnabled(): boolean {
  if (isEmergencyAiKillSwitch()) return false;
  return isFeatureEnabled(process.env.NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW, true);
}

/**
 * Legend-first technical symbol reading (electrical drawings first).
 * Default ON when the estimator flow is on; set NEXT_PUBLIC_ENABLE_AI_SYMBOL_READING=0 to disable.
 */
export function isAiSymbolReadingEnabled(): boolean {
  return (
    isAiEstimatorFlowEnabled() &&
    process.env.NEXT_PUBLIC_ENABLE_AI_SYMBOL_READING !== "0"
  );
}

/**
 * Visual symbol counter for electrical drawings (pixel-level detection of
 * graphical symbols without OCR text, e.g. switches).
 */
export function isAiVisualSymbolCounterEnabled(): boolean {
  return (
    isAiEstimatorFlowEnabled() &&
    isFeatureEnabled(process.env.NEXT_PUBLIC_ENABLE_AI_VISUAL_SYMBOL_COUNTER, true)
  );
}

/**
 * Interactive PDF evidence viewer + linked takeoff positions in the setup flow.
 * Default ON when the estimator flow is on; set NEXT_PUBLIC_ENABLE_AI_EVIDENCE_PDF_VIEWER=0 to disable.
 */
export function isAiEvidencePdfViewerEnabled(): boolean {
  return (
    isAiEstimatorFlowEnabled() &&
    process.env.NEXT_PUBLIC_ENABLE_AI_EVIDENCE_PDF_VIEWER !== "0"
  );
}

export function isAiEstimatorDebugEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_AI_ESTIMATOR_DEBUG === "1" ||
    process.env.AI_ESTIMATOR_DEBUG === "1"
  );
}

export function logAiEstimatorDebug(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isAiEstimatorDebugEnabled()) return;
  // Avoid dumping full PII — callers should pass counts/ids only.
  console.info(`[ai-estimator] ${event}`, payload);
}
