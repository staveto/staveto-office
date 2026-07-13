/**
 * Visual symbol occurrence counting — pipeline abstraction.
 *
 * Real CV / licensed detectors plug in here later.
 * Until then: return null counts and source "unknown". Do NOT invent numbers.
 */

import type {
  AiLegendEntry,
  AiSymbolOccurrenceDetection,
  AiSymbolCountingSummary,
} from "@/types/aiEstimator";

export type EstimateSymbolOccurrencesInput = {
  /** Page image as data URL, storage path, or opaque handle — unused in placeholder. */
  documentPageImage?: string | null;
  pageNumber?: number;
  legendItems: Array<
    Pick<AiLegendEntry, "id" | "symbolLabel" | "symbolDescription" | "normalizedType" | "unit">
  >;
  roomName?: string;
};

/**
 * Estimate how many times each legend symbol appears on a drawing page.
 * Placeholder: always unavailable — never fakes occurrence counts.
 */
export async function estimateSymbolOccurrences(
  input: EstimateSymbolOccurrencesInput
): Promise<AiSymbolOccurrenceDetection[]> {
  const page = input.pageNumber ?? 1;
  return input.legendItems.map((legend) => ({
    symbolCode: legend.symbolLabel?.trim() || legend.normalizedType,
    label: legend.symbolDescription,
    roomName: input.roomName,
    detectedOccurrenceCount: null,
    confidence: "low" as const,
    bbox: undefined,
    source: "unknown" as const,
    needsReview: true,
    reviewReason:
      "Počítanie symbolov priamo vo výkrese zatiaľ nie je dostupné. Overte množstvo manuálne.",
    pageNumber: page,
  }));
}

/** Build a facts.symbolCounting summary from detector results (honest). */
export function summarizeSymbolCounting(
  detections: AiSymbolOccurrenceDetection[]
): AiSymbolCountingSummary {
  const withCount = detections.filter((d) => typeof d.detectedOccurrenceCount === "number");
  if (withCount.length === 0) {
    return {
      status: "unavailable",
      drawingDetectionAvailable: false,
      detections,
      note: "Spočítané vo výkrese: zatiaľ nie je dostupné",
    };
  }
  const allHaveCount = withCount.length === detections.length;
  return {
    status: allHaveCount ? "available" : "partial",
    drawingDetectionAvailable: true,
    detections,
  };
}

/** Sync helper used by UI/tests when no async page image is available. */
export function createUnavailableSymbolCounting(
  legendItems: EstimateSymbolOccurrencesInput["legendItems"] = []
): AiSymbolCountingSummary {
  const detections: AiSymbolOccurrenceDetection[] = legendItems.map((legend) => ({
    symbolCode: legend.symbolLabel?.trim() || legend.normalizedType,
    label: legend.symbolDescription,
    detectedOccurrenceCount: null,
    confidence: "low",
    source: "unknown",
    needsReview: true,
    reviewReason: "Visual counting not available",
  }));
  return summarizeSymbolCounting(detections);
}
