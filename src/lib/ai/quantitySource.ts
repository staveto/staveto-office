/**
 * Honest quantity-source helpers for AI Estimator.
 * Never treat legend/schedule parsing as confirmed drawing detection.
 */

import type {
  AiConfidence,
  AiEstimatorFacts,
  AiExtractedItem,
  AiSymbolCountingSummary,
  AiSymbolOccurrenceDetection,
  QuantitySource,
  QuoteReadinessState,
} from "@/types/aiEstimator";

export type SymbolCountRowStatus =
  | "ok"
  | "needs_confirm"
  | "missing_on_drawing"
  | "missing_in_legend"
  | "unknown_symbol"
  | "unmeasured_length";

export type SymbolCountComparisonRow = {
  id: string;
  roomName: string;
  symbolCode: string;
  label: string;
  unit: string;
  quantityFromSchedule: number | null;
  detectedOccurrenceCount: number | null;
  difference: number | null;
  quantitySource: QuantitySource;
  confidence: AiConfidence;
  status: SymbolCountRowStatus;
  needsReview: boolean;
  reviewReason?: string;
  pageNumber?: number;
  hasBbox: boolean;
  included: boolean;
};

const CRITICAL_TITLE_RE =
  /zásuv|zasuv|socket|vypína|vypina|switch|svietidl|led|rozvád|rozvad/;

export function resolveQuantitySource(item: AiExtractedItem): QuantitySource {
  if (item.quantitySource) return item.quantitySource;
  if (item.origin === "from_user_text") return "manual";
  if (item.origin === "inferred" || item.origin === "assumption") return "ai_estimate";
  if (item.origin === "missing") return "unknown";
  if (typeof item.detectedOccurrenceCount === "number") return "drawing_detection";
  if (typeof item.quantityFromSchedule === "number") return "schedule";
  // Legend promotion usually has no quantity
  if (item.quantity == null && item.computedQuantity == null) return "legend";
  // Parsed from drawing text/table without visual count
  if (item.origin === "from_document" || item.origin === "from_photo") return "schedule";
  return "unknown";
}

export function getSymbolCountingSummary(facts: AiEstimatorFacts): AiSymbolCountingSummary {
  if (facts.symbolCounting) return facts.symbolCounting;

  // Fallback: derive honest detections from occurrences the model explicitly
  // marked as visually counted. Schedule/legend numbers never become detections.
  const detections: AiSymbolCountingSummary["detections"] = (
    facts.symbolOccurrences ?? []
  )
    .filter(
      (s) =>
        s.quantitySource === "drawing_detection" ||
        typeof s.detectedOccurrenceCount === "number"
    )
    .map((s) => ({
      symbolCode: s.visibleLabel?.trim() || s.title,
      label: s.title,
      roomName: s.roomName,
      detectedOccurrenceCount:
        typeof s.detectedOccurrenceCount === "number"
          ? s.detectedOccurrenceCount
          : (typeof s.quantity === "number" ? s.quantity : null),
      confidence: s.confidence,
      bbox: s.bbox,
      source: "drawing_detection" as const,
      needsReview: s.needsReview,
      reviewReason: s.reviewReason,
      pageNumber: s.page,
    }));
  const hasReal = detections.some((d) => typeof d.detectedOccurrenceCount === "number");

  return {
    status: hasReal ? "partial" : "unavailable",
    drawingDetectionAvailable: hasReal,
    detections,
    note: hasReal
      ? undefined
      : "Visual symbol counting on the drawing is not available yet. Quantities come from legend/schedule/AI — not from confirmed drawing detection.",
  };
}

export function buildSymbolCountComparisonRows(
  facts: AiEstimatorFacts,
  overrides?: Record<string, Partial<AiExtractedItem>>
): SymbolCountComparisonRow[] {
  const items = [...facts.extractedItems, ...facts.inferredItems];
  const counting = getSymbolCountingSummary(facts);
  const detectionByKey = indexDetections(counting.detections);

  return items.map((raw) => {
    const o = overrides?.[raw.id];
    const item = o ? applyManualQuantityOverride(raw, o) : raw;
    const source = resolveQuantitySource(item);
    const scheduleQty =
      item.quantityFromSchedule ??
      (source === "schedule" || source === "legend"
        ? (item.computedQuantity ?? item.quantity ?? null)
        : source === "manual"
          ? (item.computedQuantity ?? item.quantity ?? null)
          : (item.quantityFromSchedule ?? null));

    const detection =
      detectionByKey.get(detectionKey(item.symbolCode || item.title, item.roomName)) ??
      null;

    const detected =
      item.detectedOccurrenceCount ??
      detection?.detectedOccurrenceCount ??
      null;

    const qtyForDiff =
      item.computedQuantity ?? item.quantity ?? scheduleQty ?? null;
    const difference =
      typeof detected === "number" && typeof qtyForDiff === "number"
        ? Math.round((detected - qtyForDiff) * 1000) / 1000
        : null;

    const status = resolveRowStatus(item, source, scheduleQty, detected, counting);
    return {
      id: item.id,
      roomName: item.roomName?.trim() || "—",
      symbolCode: item.symbolCode || "—",
      label: item.title,
      unit: item.unit && item.unit !== "unknown" ? item.unit : "—",
      quantityFromSchedule: scheduleQty,
      detectedOccurrenceCount: counting.drawingDetectionAvailable ? detected : null,
      difference: counting.drawingDetectionAvailable ? difference : null,
      quantitySource: source,
      confidence: item.confidence,
      status,
      needsReview: item.needsReview || status !== "ok",
      reviewReason: item.reviewReason,
      pageNumber: item.pageNumber ?? item.bbox?.page ?? item.evidence?.[0]?.page,
      hasBbox: Boolean(item.bbox),
      included: item.included !== false,
    };
  });
}

function detectionKey(code: string, room?: string): string {
  return `${(room ?? "").toLowerCase()}::${code.toLowerCase()}`;
}

function indexDetections(
  detections: AiSymbolOccurrenceDetection[]
): Map<string, AiSymbolOccurrenceDetection> {
  const map = new Map<string, AiSymbolOccurrenceDetection>();
  for (const d of detections) {
    map.set(detectionKey(d.symbolCode, d.roomName), d);
  }
  return map;
}

function resolveRowStatus(
  item: AiExtractedItem,
  source: QuantitySource,
  scheduleQty: number | null,
  detected: number | null,
  counting: AiSymbolCountingSummary
): SymbolCountRowStatus {
  if (/neznám|unknown/i.test(item.title) || /neznám|unknown/i.test(item.reviewReason ?? "")) {
    return "unknown_symbol";
  }
  if (
    item.unit === "m" &&
    (item.quantity == null || item.needsReview) &&
    (/zamera|length|dĺžk|dlzk/i.test(item.reviewReason ?? "") || item.quantity == null)
  ) {
    return "unmeasured_length";
  }
  if (source === "manual" && !item.needsReview && (scheduleQty != null || item.quantity != null)) {
    return "ok";
  }
  if (!counting.drawingDetectionAvailable) {
    if (item.needsReview || scheduleQty == null) return "needs_confirm";
    return "needs_confirm";
  }
  if (detected == null && scheduleQty != null) return "missing_on_drawing";
  if (detected != null && scheduleQty == null) return "missing_in_legend";
  if (
    typeof detected === "number" &&
    typeof scheduleQty === "number" &&
    Math.abs(detected - scheduleQty) > 0.01
  ) {
    return "needs_confirm";
  }
  if (item.needsReview) return "needs_confirm";
  if (source === "drawing_detection" && !item.needsReview) return "ok";
  return item.needsReview ? "needs_confirm" : "ok";
}

export function resolveQuoteReadiness(params: {
  facts: AiEstimatorFacts;
  criticalQuestionCount: number;
  comparisonRows: SymbolCountComparisonRow[];
}): { state: QuoteReadinessState; warning?: string } {
  const counting = getSymbolCountingSummary(params.facts);
  const included = params.comparisonRows.filter((r) => r.included);

  const hasUnknown = included.some((r) => r.status === "unknown_symbol");
  const hasMissingQty = included.some(
    (r) =>
      r.quantityFromSchedule == null &&
      r.detectedOccurrenceCount == null &&
      (r.status === "needs_confirm" ||
        r.status === "missing_on_drawing" ||
        r.status === "unmeasured_length")
  );

  if (params.criticalQuestionCount > 0 || hasUnknown) {
    return {
      state: "needs_review",
      warning:
        "Ponuka ešte nie je pripravená. Chýbajú overené počty alebo sú nejasné značky.",
    };
  }

  if (hasMissingQty && counting.drawingDetectionAvailable) {
    return {
      state: "needs_review",
      warning:
        "Ponuka ešte nie je pripravená. Chýbajú overené počty alebo sú nejasné značky.",
    };
  }

  const criticalWithoutDetection = included.some((r) => {
    const title = `${r.symbolCode} ${r.label}`.toLowerCase();
    return (
      CRITICAL_TITLE_RE.test(title) &&
      r.quantitySource !== "drawing_detection" &&
      r.quantitySource !== "manual"
    );
  });

  if (!counting.drawingDetectionAvailable && criticalWithoutDetection) {
    return {
      state: "partially_ready",
      warning:
        "Ponuka je pripravená len orientačne. Počty symbolov neboli plne overené priamo vo výkrese.",
    };
  }

  if (
    !counting.drawingDetectionAvailable &&
    included.some((r) => r.status === "needs_confirm")
  ) {
    return {
      state: "partially_ready",
      warning:
        "Ponuka je pripravená len orientačne. Počty symbolov neboli plne overené priamo vo výkrese.",
    };
  }

  const mismatches = included.filter(
    (r) => r.difference != null && Math.abs(r.difference) > 0.01
  );
  if (mismatches.length > 0) {
    return {
      state: "partially_ready",
      warning:
        "Ponuka je pripravená len orientačne. Počty vo výkaze a vo výkrese sa nezhodujú.",
    };
  }

  if (counting.drawingDetectionAvailable && included.every((r) => r.status === "ok" || !r.included)) {
    return { state: "ready" };
  }

  if (included.every((r) => r.quantitySource === "manual" || r.status === "ok")) {
    return { state: "ready" };
  }

  return {
    state: "partially_ready",
    warning:
      "Ponuka je pripravená len orientačne. Počty symbolov neboli plne overené priamo vo výkrese.",
  };
}

export function applyManualQuantityOverride(
  item: AiExtractedItem,
  patch: {
    quantity?: number;
    roomName?: string;
    unit?: AiExtractedItem["unit"];
    title?: string;
    included?: boolean;
  }
): AiExtractedItem {
  return {
    ...item,
    ...patch,
    computedQuantity: patch.quantity ?? item.computedQuantity,
    quantity: patch.quantity ?? item.quantity,
    quantitySource: "manual",
    origin: "from_user_text",
    confidence: "high",
    needsReview: false,
    reviewReason: undefined,
  };
}
