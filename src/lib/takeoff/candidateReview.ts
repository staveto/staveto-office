/**
 * Pure helpers for Phase 2 symbol-candidate human review.
 * No Firestore / React — grouping, default types, takeoff quantity math.
 */

import type {
  AnalyzeRegionCandidateDto,
  BBoxPdf,
  SymbolCandidate,
  SymbolColorLayer,
  TakeoffItem,
} from "@/types/pdfTakeoff";
import type { NormalizedRect } from "@/types/drawingTakeoff";

export type CandidateReviewGroupId =
  | "sockets"
  | "switches"
  | "lights"
  | "led"
  | "uncertain"
  | "ignored";

export type CandidateReviewGroup = {
  id: CandidateReviewGroupId;
  /** i18n key */
  labelKey: string;
  candidates: AnalyzeRegionCandidateDto[];
};

const GROUP_ORDER: CandidateReviewGroupId[] = [
  "sockets",
  "switches",
  "lights",
  "led",
  "uncertain",
  "ignored",
];

const GROUP_LABEL_KEYS: Record<CandidateReviewGroupId, string> = {
  sockets: "takeoff.review.group.sockets",
  switches: "takeoff.review.group.switches",
  lights: "takeoff.review.group.lights",
  led: "takeoff.review.group.led",
  uncertain: "takeoff.review.group.uncertain",
  ignored: "takeoff.review.group.ignored",
};

/** Active review = not rejected/confirmed (confirmed leave the review list). */
export function isActiveReviewCandidate(
  c: Pick<AnalyzeRegionCandidateDto, "status" | "kind">
): boolean {
  if (c.status === "rejected" || c.status === "confirmed") return false;
  return true;
}

export function defaultSymbolTypeForCandidate(
  c: Pick<AnalyzeRegionCandidateDto, "color_layer" | "label_suggestions" | "status">
): string {
  const label = (c.label_suggestions[0]?.label ?? "").toLowerCase();
  if (label.includes("led")) return "led_strip";
  if (c.status === "unknown_type") return "unknown";
  if (c.color_layer === "green") return "socket";
  if (c.color_layer === "red") return "switch";
  if (c.color_layer === "orange") {
    return label.includes("led") ? "led_strip" : "light";
  }
  return "generic";
}

export function defaultLabelForSymbolType(symbolType: string): string {
  switch (symbolType) {
    case "socket":
      return "zásuvka";
    case "switch":
      return "vypínač";
    case "light":
      return "svetlo";
    case "led_strip":
      return "LED pás";
    case "unknown":
      return "neznámy typ";
    default:
      return symbolType.replace(/_/g, " ");
  }
}

/** Color layer implied by a symbol type — used for manual marks. */
export function colorLayerForManualType(symbolType: string): AnalyzeRegionCandidateDto["color_layer"] {
  switch (symbolType) {
    case "socket":
      return "green";
    case "switch":
      return "red";
    case "light":
    case "led_strip":
      return "orange";
    default:
      return "unknown";
  }
}

/**
 * Manual mark → shared symbolCandidate DTO. Manual marks live in the SAME
 * model as detected candidates, so confirm/reject/evidence/quantity flows
 * are identical regardless of origin (quote or project route).
 */
export function buildManualCandidateDto(params: {
  pageNumber: number;
  normalizedPosition: NormalizedRect;
  symbolType: string;
  label?: string;
  note?: string | null;
}): AnalyzeRegionCandidateDto {
  const label = params.label?.trim() || defaultLabelForSymbolType(params.symbolType);
  return {
    id: `cand_man_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    page_number: params.pageNumber,
    // Without page point size the normalized rect doubles as bbox reference.
    bbox_pdf: [
      params.normalizedPosition.x,
      params.normalizedPosition.y,
      params.normalizedPosition.x + params.normalizedPosition.width,
      params.normalizedPosition.y + params.normalizedPosition.height,
    ],
    bbox_px: [0, 0, 0, 0],
    color_layer: colorLayerForManualType(params.symbolType),
    kind: "symbol_candidate",
    label_suggestions: [{ label, confidence: 0.99 }],
    nearby_text: params.note?.trim() || null,
    confidence: 0.99,
    source: "manual",
    status: "probable",
    preview_image_url: null,
    normalized_position: params.normalizedPosition,
  };
}

export function reviewGroupForCandidate(
  c: AnalyzeRegionCandidateDto
): CandidateReviewGroupId {
  if (c.kind === "ignored" || c.kind === "text" || c.kind === "dimension" || c.kind === "line") {
    return "ignored";
  }
  if (
    c.status === "unknown_type" ||
    c.status === "needs_customer_info" ||
    c.confidence < 0.5 ||
    c.color_layer === "unknown"
  ) {
    return "uncertain";
  }
  const type = defaultSymbolTypeForCandidate(c);
  if (type === "led_strip") return "led";
  if (type === "socket") return "sockets";
  if (type === "switch") return "switches";
  if (type === "light") return "lights";
  return "uncertain";
}

export function groupCandidatesForReview(
  candidates: AnalyzeRegionCandidateDto[]
): CandidateReviewGroup[] {
  const active = candidates.filter(isActiveReviewCandidate);
  const buckets = new Map<CandidateReviewGroupId, AnalyzeRegionCandidateDto[]>();
  for (const id of GROUP_ORDER) buckets.set(id, []);
  for (const c of active) {
    const g = reviewGroupForCandidate(c);
    buckets.get(g)!.push(c);
  }
  return GROUP_ORDER.map((id) => ({
    id,
    labelKey: GROUP_LABEL_KEYS[id],
    candidates: buckets.get(id) ?? [],
  })).filter((g) => g.candidates.length > 0);
}

export function dtoFromSymbolCandidate(c: SymbolCandidate): AnalyzeRegionCandidateDto {
  return {
    id: c.id,
    page_number: c.pageNumber,
    bbox_pdf: c.bboxPdf,
    bbox_px: c.bboxPx,
    color_layer: c.colorLayer,
    kind: c.kind,
    label_suggestions: c.labelSuggestions,
    nearby_text: c.nearbyText,
    confidence: c.confidence,
    source: c.source,
    status: c.status,
    preview_image_url: c.previewImageUrl,
    normalized_position: c.normalizedPosition,
  };
}

/**
 * Apply +1 quantity for a confirmed symbol onto takeoff items (same
 * project + drawing + profession + symbolType/name).
 */
export function applyConfirmToTakeoffItems(params: {
  items: TakeoffItem[];
  projectId: string;
  drawingId: string;
  profession: string;
  symbolType: string;
  name: string;
  unit: string;
  quantityValue: number;
  now: string;
  newItemId: string;
}): { items: TakeoffItem[]; updatedItem: TakeoffItem; created: boolean } {
  const {
    items,
    projectId,
    drawingId,
    profession,
    symbolType,
    name,
    unit,
    quantityValue,
    now,
    newItemId,
  } = params;

  const existing = items.find(
    (i) =>
      i.drawingId === drawingId &&
      i.profession === profession &&
      i.sourceOfQuantity === "symbol_detection" &&
      i.status !== "excluded" &&
      (i.metadata?.symbolType === symbolType || i.name === name)
  );

  if (existing) {
    const updated: TakeoffItem = {
      ...existing,
      quantity: existing.quantity + quantityValue,
      evidenceCount: existing.evidenceCount + 1,
      status: existing.status === "legend_only" ? "needs_review" : existing.status,
      updatedAt: now,
    };
    return {
      items: items.map((i) => (i.id === existing.id ? updated : i)),
      updatedItem: updated,
      created: false,
    };
  }

  const created: TakeoffItem = {
    id: newItemId,
    projectId,
    drawingId,
    quoteId: null,
    name,
    profession,
    quantity: quantityValue,
    unit,
    sourceOfQuantity: "symbol_detection",
    status: "confirmed",
    evidenceCount: 1,
    metadata: { symbolType },
    createdAt: now,
    updatedAt: now,
  };
  return { items: [...items, created], updatedItem: created, created: true };
}

/**
 * Reverse of applyConfirmToTakeoffItems — deleting a confirmed symbol must
 * give back the exact quantity/evidence it added, never leave a stale
 * takeoff item behind, and never touch unrelated items (different
 * drawing/profession/symbolType never match).
 */
export function applyUnconfirmToTakeoffItems(params: {
  items: TakeoffItem[];
  drawingId: string;
  profession: string;
  symbolType: string;
  name: string;
  quantityValue: number;
  now: string;
}): { updatedItem: TakeoffItem | null; removeItemId: string | null } {
  const { items, drawingId, profession, symbolType, name, quantityValue, now } = params;

  const existing = items.find(
    (i) =>
      i.drawingId === drawingId &&
      i.profession === profession &&
      i.sourceOfQuantity === "symbol_detection" &&
      (i.metadata?.symbolType === symbolType || i.name === name)
  );
  if (!existing) return { updatedItem: null, removeItemId: null };

  const nextQuantity = existing.quantity - quantityValue;
  const nextEvidenceCount = Math.max(0, existing.evidenceCount - 1);
  if (nextQuantity <= 0 || nextEvidenceCount === 0) {
    return { updatedItem: null, removeItemId: existing.id };
  }

  const updated: TakeoffItem = {
    ...existing,
    quantity: nextQuantity,
    evidenceCount: nextEvidenceCount,
    updatedAt: now,
  };
  return { updatedItem: updated, removeItemId: null };
}

/** Intersection-over-union of two normalized page rects (0 when disjoint). */
export function normalizedRectOverlapRatio(
  a: NormalizedRect,
  b: NormalizedRect
): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Translate a stored bbox_pdf the SAME real-world distance the marker was
 * dragged, expressed in normalized (0..1 page) coordinates.
 *
 * bbox_pdf is stored in either PDF points OR normalized 0..1 units
 * depending on whether page size in points was known when the entity was
 * created (see types/pdfTakeoff.ts header) — so this never assumes a unit
 * convention. It derives a per-axis scale factor from the EXISTING
 * bbox_pdf vs. the EXISTING normalizedPosition, then applies that same
 * scale to the delta — correct regardless of which units bbox_pdf is in,
 * and a no-op (falls back to 1) when a rect has zero width/height.
 */
export function translateBboxPdfForMove(
  oldBboxPdf: BBoxPdf,
  oldNormalized: NormalizedRect,
  newNormalized: NormalizedRect
): BBoxPdf {
  const scaleX = oldNormalized.width > 0 ? (oldBboxPdf[2] - oldBboxPdf[0]) / oldNormalized.width : 1;
  const scaleY = oldNormalized.height > 0 ? (oldBboxPdf[3] - oldBboxPdf[1]) / oldNormalized.height : 1;
  const dx = (newNormalized.x - oldNormalized.x) * scaleX;
  const dy = (newNormalized.y - oldNormalized.y) * scaleY;
  return [oldBboxPdf[0] + dx, oldBboxPdf[1] + dy, oldBboxPdf[2] + dx, oldBboxPdf[3] + dy];
}

export const CONFIRMED_SYMBOL_DUPLICATE_IOU = 0.5;

/**
 * Duplicate protection: find an already-confirmed symbol on the same
 * drawing/page whose bbox overlaps the new one above the IoU threshold.
 */
export function findDuplicateConfirmedSymbol<
  T extends {
    id: string;
    drawingId: string;
    pageNumber: number;
    normalizedPosition: NormalizedRect;
  },
>(params: {
  existing: T[];
  drawingId: string;
  pageNumber: number;
  normalizedPosition: NormalizedRect;
  threshold?: number;
}): T | null {
  const threshold = params.threshold ?? CONFIRMED_SYMBOL_DUPLICATE_IOU;
  for (const sym of params.existing) {
    if (sym.drawingId !== params.drawingId) continue;
    if (sym.pageNumber !== params.pageNumber) continue;
    if (
      normalizedRectOverlapRatio(sym.normalizedPosition, params.normalizedPosition) >=
      threshold
    ) {
      return sym;
    }
  }
  return null;
}

/**
 * Safety invariants for persisted takeoff items:
 * - every quantity must carry a sourceOfQuantity
 * - legend_only quantities must never be stored as confirmed
 */
export function sanitizeTakeoffItemForWrite(item: TakeoffItem): TakeoffItem {
  if (!item.sourceOfQuantity) {
    throw new Error("TAKEOFF_ITEM_MISSING_SOURCE_OF_QUANTITY");
  }
  if (item.sourceOfQuantity === "legend_only" && item.status === "confirmed") {
    return { ...item, status: "legend_only" };
  }
  return item;
}

export function colorLayerAccent(layer: SymbolColorLayer): string {
  switch (layer) {
    case "green":
      return "#16A34A";
    case "red":
      return "#DC2626";
    case "orange":
      return "#EA580C";
    case "blue":
      return "#2563EB";
    default:
      return "#7C3AED";
  }
}
