/**
 * Feature flags for the AI Estimator / quote-first flow.
 * When disabled, the existing generateProjectDraft path is used unchanged.
 */

export function isAiEstimatorFlowEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_AI_ESTIMATOR_FLOW === "1";
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
 * graphical symbols without OCR text, e.g. switches). Default OFF.
 */
export function isAiVisualSymbolCounterEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_AI_VISUAL_SYMBOL_COUNTER === "1";
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
