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

/**
 * Multi-document estimator: several PDFs/files in one session, merged takeoff + conflicts.
 * Default OFF — set NEXT_PUBLIC_ENABLE_AI_MULTI_DOCUMENT_ESTIMATOR=1 to enable.
 */
export function isAiMultiDocumentEstimatorEnabled(): boolean {
  return (
    isAiEstimatorFlowEnabled() &&
    process.env.NEXT_PUBLIC_ENABLE_AI_MULTI_DOCUMENT_ESTIMATOR === "1"
  );
}

export function isAiEstimatorDebugEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_AI_ESTIMATOR_DEBUG === "1" ||
    process.env.AI_ESTIMATOR_DEBUG === "1"
  );
}

/**
 * PDF Takeoff Region Analyzer — multi-candidate color/contour detection for
 * a user-drawn region. Default ON with the estimator flow; set
 * NEXT_PUBLIC_ENABLE_PDF_TAKEOFF_REGION_ANALYZER=0 to hide the button.
 */
export function isPdfTakeoffRegionAnalyzerEnabled(): boolean {
  if (isEmergencyAiKillSwitch()) return false;
  return (
    isAiEstimatorFlowEnabled() &&
    process.env.NEXT_PUBLIC_ENABLE_PDF_TAKEOFF_REGION_ANALYZER !== "0"
  );
}

/**
 * Detection debug panel in the takeoff workbench (region crop, masks,
 * before/after candidates, thresholds). Dev builds default ON; production
 * requires NEXT_PUBLIC_TAKEOFF_DETECTION_DEBUG=1 explicitly.
 */
export function isTakeoffDetectionDebugEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_TAKEOFF_DETECTION_DEBUG === "1") return true;
  return process.env.NODE_ENV === "development";
}

export function logAiEstimatorDebug(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!isAiEstimatorDebugEnabled()) return;
  // Avoid dumping full PII — callers should pass counts/ids only.
  console.info(`[ai-estimator] ${event}`, payload);
}
