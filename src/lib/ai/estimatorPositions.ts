/**
 * Evidence-linked estimator positions.
 *
 * Builds stable, traceable takeoff positions (E-ZAS-001, E-VYP-001, …) from
 * estimator facts + visual detections, each carrying evidence anchors that
 * point back into the uploaded PDF (fileName, page, bbox when available).
 *
 * Pure functions — no Firestore access here. Persist via
 * saveEstimatorSessionSnapshot (which sanitizes undefined values).
 */

import type {
  AiEstimatorFacts,
  AiExtractedItem,
  AiSymbolBBox,
  AiSymbolOccurrence,
} from "@/types/aiEstimator";
import type { VisualSymbolDetection } from "@/types/visualSymbols";
import type {
  EstimatorEvidenceAnchor,
  EstimatorEvidenceSourceKind,
  EstimatorPosition,
  EstimatorPositionBBox,
  EstimatorPositionTrade,
  EstimatorPositionUnit,
  EstimatorPriceStatus,
  EstimatorQuantityConflict,
  EstimatorQuantitySource,
  EstimatorReviewStatus,
  PdfOverlayAnnotation,
  PdfOverlayColorKey,
} from "@/types/estimatorPositions";

export type {
  EstimatorEvidenceAnchor,
  EstimatorPosition,
  PdfOverlayAnnotation,
} from "@/types/estimatorPositions";
import {
  bucketStrictSimilarHits,
  SIMILAR_ACCEPTED_MIN,
  SIMILAR_UNCERTAIN_MIN,
  type StrictSimilarHit,
} from "./strictSimilarMatch";

// ---------------------------------------------------------------------------
// Position codes (Phase 7)
// ---------------------------------------------------------------------------

const ELECTRICAL_CODE_BY_CATEGORY: Record<string, string> = {
  socket: "ZAS",
  double_socket: "ZAS",
  switch: "VYP",
  lighting: "SV",
  led_strip: "LED",
  cable: "KAB",
  distribution_board: "ROZ",
  installation_material: "INS",
  testing: "SKU",
  labor: "PRA",
  other: "UNK",
  unknown: "UNK",
};

const TRADE_PREFIX: Record<EstimatorPositionTrade, string> = {
  electrical: "E",
  plumbing: "P",
  hvac: "H",
  painting: "M",
  flooring: "F",
  roofing: "R",
  general_construction: "G",
};

export function positionCategoryCode(
  trade: EstimatorPositionTrade,
  category: string
): string {
  const prefix = TRADE_PREFIX[trade] ?? "G";
  if (trade === "electrical") {
    return `${prefix}-${ELECTRICAL_CODE_BY_CATEGORY[category] ?? "UNK"}`;
  }
  const cat = category
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 3);
  return `${prefix}-${cat || "UNK"}`;
}

// ---------------------------------------------------------------------------
// Category → overlay color
// ---------------------------------------------------------------------------

export function overlayColorKeyForCategory(category: string): PdfOverlayColorKey {
  switch (category) {
    case "socket":
    case "double_socket":
      return "socket";
    case "switch":
      return "switch";
    case "lighting":
      return "lighting";
    case "led_strip":
      return "led";
    case "cable":
      return "cabling";
    case "other":
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// bbox normalization — anchors always store 0..1 page coordinates
// ---------------------------------------------------------------------------

export type PageSize = { width: number; height: number };

export function normalizeEvidenceBBox(
  bbox: AiSymbolBBox | { x: number; y: number; width: number; height: number } | undefined,
  pageSize?: PageSize
): EstimatorPositionBBox | undefined {
  if (!bbox) return undefined;
  const { x, y, width, height } = bbox;
  if (![x, y, width, height].every((v) => Number.isFinite(v))) return undefined;
  const looksNormalized = x <= 1.5 && y <= 1.5 && width <= 1.5 && height <= 1.5;
  if (looksNormalized) {
    return {
      x: clamp01(x),
      y: clamp01(y),
      width: clamp01(width),
      height: clamp01(height),
    };
  }
  if (!pageSize || pageSize.width <= 0 || pageSize.height <= 0) return undefined;
  return {
    x: clamp01(x / pageSize.width),
    y: clamp01(y / pageSize.height),
    width: clamp01(width / pageSize.width),
    height: clamp01(height / pageSize.height),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number(v.toFixed(5))));
}

/** Normalized bbox IoU — used to avoid duplicate marks at the same spot. */
export function estimatorBBoxIoU(
  a: EstimatorPositionBBox,
  b: EstimatorPositionBBox
): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function boxesNearDuplicate(
  a: EstimatorPositionBBox,
  b: EstimatorPositionBBox,
  iouThreshold = 0.35
): boolean {
  if (estimatorBBoxIoU(a, b) >= iouThreshold) return true;
  const acx = a.x + a.width / 2;
  const acy = a.y + a.height / 2;
  const bcx = b.x + b.width / 2;
  const bcy = b.y + b.height / 2;
  // Only treat as duplicate when centers almost coincide (same mark).
  // Adjacent identical symbols (~1% page apart) must stay separate.
  return Math.hypot(acx - bcx, acy - bcy) < 0.008;
}

// ---------------------------------------------------------------------------
// Build positions from estimator facts (Phase 1 + 2 + 7)
// ---------------------------------------------------------------------------

export type BuildPositionsOptions = {
  fileName: string;
  fileId?: string;
  trade?: EstimatorPositionTrade;
  currency?: string;
  /** Page pixel sizes for normalizing pixel-space bboxes (e.g. visual detections). */
  pageSizeByPage?: Record<number, PageSize>;
  /** Extra visual detections not already embedded in facts.visualDetections. */
  visualDetections?: VisualSymbolDetection[];
};

const UNIT_MAP: Record<string, EstimatorPositionUnit> = {
  ks: "ks",
  pcs: "ks",
  bod: "ks",
  m: "m",
  bm: "bm",
  m2: "m2",
  m3: "m3",
  set: "set",
  hod: "h",
  h: "h",
};

function toPositionUnit(unit?: string): EstimatorPositionUnit {
  return UNIT_MAP[(unit ?? "").toLowerCase()] ?? "unknown";
}

function quantitySourceOf(item: AiExtractedItem): EstimatorQuantitySource {
  switch (item.quantitySource) {
    case "legend":
      return "legend";
    case "schedule":
      return "schedule";
    case "drawing_detection":
      return "drawing_detection";
    case "manual":
      return "manual";
    case "ai_estimate":
      return "ai_estimate";
    default:
      return item.origin === "from_document" ? "legend" : "ai_estimate";
  }
}

function anchorSourceOf(item: AiExtractedItem): EstimatorEvidenceSourceKind {
  if (item.quantitySource === "schedule" || item.quantityFromSchedule != null) {
    return "schedule_table";
  }
  if (item.quantitySource === "drawing_detection") return "drawing_occurrence";
  if (item.origin === "from_document") return "project_legend";
  return "ai_inferred";
}

function itemQty(item: AiExtractedItem): number {
  const q = item.computedQuantity ?? item.quantity;
  return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : 0;
}

/** Deterministic sort so position codes stay stable across refresh. */
function stableSortKey(input: {
  category: string;
  label: string;
  page: number;
  sourceText: string;
}): string {
  return [
    input.category,
    input.label.toLowerCase().trim(),
    String(input.page).padStart(4, "0"),
    input.sourceText.toLowerCase().trim(),
  ].join("::");
}

const CATEGORY_ORDER = [
  "socket",
  "switch",
  "lighting",
  "led_strip",
  "cable",
  "distribution_board",
  "installation_material",
  "testing",
  "labor",
  "other",
  "unknown",
];

/**
 * Build evidence-linked positions from folded estimator facts.
 * Sources: extracted+inferred items (rows), matching drawing occurrences
 * (extra anchors), unknown symbols (review rows), visual detections (review rows).
 */
export function buildEstimatorPositionsFromFacts(
  facts: AiEstimatorFacts,
  options: BuildPositionsOptions
): EstimatorPosition[] {
  const trade = options.trade ?? "electrical";
  const currency = options.currency ?? "EUR";
  const occurrences = facts.symbolOccurrences ?? [];

  type Draft = Omit<EstimatorPosition, "id" | "positionCode"> & { sortKey: string };
  const drafts: Draft[] = [];

  const anchorFromOccurrence = (
    occ: AiSymbolOccurrence,
    index: number
  ): EstimatorEvidenceAnchor => ({
    id: `anchor_occ_${occ.id || index}`,
    fileId: options.fileId,
    fileName: occ.evidence?.[0]?.fileName || options.fileName,
    page: occ.page > 0 ? occ.page : 1,
    sourceType: "drawing_occurrence",
    sourceText: occ.visibleLabel || occ.title,
    bbox: normalizeEvidenceBBox(occ.bbox, options.pageSizeByPage?.[occ.page ?? 1]),
    confidence: occ.confidence,
    needsReview: occ.needsReview,
  });

  // Occurrence lookup for extra anchors on item rows.
  const occByKey = new Map<string, AiSymbolOccurrence[]>();
  for (const occ of occurrences) {
    const key = occ.title.toLowerCase().trim();
    occByKey.set(key, [...(occByKey.get(key) ?? []), occ]);
  }

  // 1) Positions from extracted + inferred items (these drive materials).
  const items = [...facts.extractedItems, ...facts.inferredItems].filter(
    (i) => i.included !== false && i.title.trim()
  );
  for (const item of items) {
    const anchors: EstimatorEvidenceAnchor[] = [
      {
        id: `anchor_item_${item.id}`,
        fileId: options.fileId,
        fileName: item.evidence?.[0]?.fileName || options.fileName,
        page: item.pageNumber ?? item.evidence?.[0]?.page ?? 1,
        sourceType: anchorSourceOf(item),
        sourceText: item.symbolCode || item.title,
        bbox: normalizeEvidenceBBox(
          item.bbox,
          options.pageSizeByPage?.[item.bbox?.page ?? item.pageNumber ?? 1]
        ),
        confidence: item.confidence,
        needsReview: item.needsReview,
      },
    ];
    const matched = occByKey.get(item.title.toLowerCase().trim()) ?? [];
    for (const [i, occ] of matched.entries()) anchors.push(anchorFromOccurrence(occ, i));

    drafts.push({
      trade,
      category: item.category,
      normalizedPoint: item.category,
      label: item.title.trim(),
      roomName: item.roomName?.trim() || undefined,
      quantity: itemQty(item),
      unit: toPositionUnit(item.unit),
      quantitySource: quantitySourceOf(item),
      evidenceAnchors: anchors,
      priceStatus: "price_missing",
      currency,
      reviewStatus:
        item.needsReview || item.confidence === "low" || itemQty(item) <= 0
          ? "needs_review"
          : "confirmed",
      reviewReason: item.reviewReason,
      sortKey: stableSortKey({
        category: item.category,
        label: item.title,
        page: item.pageNumber ?? 1,
        sourceText: item.symbolCode ?? item.title,
      }),
    });
  }

  // 2) Unknown symbols — review-only positions, never quotable.
  for (const occ of facts.unknownSymbols ?? []) {
    drafts.push({
      trade,
      category: "unknown",
      normalizedPoint: "unknown",
      label: occ.visibleLabel || occ.title || "Neznáma značka",
      roomName: occ.roomName?.trim() || undefined,
      quantity: occ.quantity ?? 0,
      unit: toPositionUnit(occ.unit),
      quantitySource: "unknown",
      evidenceAnchors: [anchorFromOccurrence(occ, 0)],
      priceStatus: "price_missing",
      currency,
      reviewStatus: "needs_review",
      reviewReason: occ.reviewReason ?? "Neznáma značka vo výkrese.",
      sortKey: stableSortKey({
        category: "unknown",
        label: occ.visibleLabel || occ.title || "?",
        page: occ.page ?? 1,
        sourceText: occ.visibleLabel || occ.title || "?",
      }),
    });
  }

  // 3) Visual detections — grouped per normalizedPoint+page, review-only until confirmed.
  const detections = [
    ...(facts.visualDetections ?? []),
    ...(options.visualDetections ?? []),
  ];
  const detectionGroups = new Map<string, VisualSymbolDetection[]>();
  for (const d of detections) {
    const key = `${d.normalizedPoint}|${d.page}`;
    detectionGroups.set(key, [...(detectionGroups.get(key) ?? []), d]);
  }
  const POINT_TO_CATEGORY: Record<string, string> = {
    switch_point: "switch",
    socket_point: "socket",
    double_socket_point: "socket",
    light_output: "lighting",
    led_strip_point: "led_strip",
    unknown: "unknown",
  };
  const POINT_LABEL: Record<string, string> = {
    switch_point: "Vypínač (vizuálna detekcia)",
    socket_point: "Zásuvka (vizuálna detekcia)",
    double_socket_point: "Dvojzásuvka (vizuálna detekcia)",
    light_output: "Svetelný vývod (vizuálna detekcia)",
    led_strip_point: "LED prvok (vizuálna detekcia)",
    unknown: "Neznáma značka (vizuálna detekcia)",
  };
  for (const [key, group] of detectionGroups) {
    const [point, pageStr] = key.split("|");
    const page = Number(pageStr) || 1;
    // Skip visual groups whose category already has counted text-based positions
    // on this drawing — visual layer must not double-count sockets/lights.
    const category = POINT_TO_CATEGORY[point] ?? "unknown";
    const textCounted = drafts.some(
      (d) => d.category === category && d.quantity > 0 && d.evidenceAnchors.some((a) => a.sourceType !== "visual_detection")
    );
    if (textCounted && category !== "switch" && category !== "unknown") continue;

    const anchors: EstimatorEvidenceAnchor[] = group.map((d, i) => ({
      id: `anchor_visual_${d.id || i}`,
      fileId: options.fileId,
      fileName: options.fileName,
      page: d.page,
      sourceType: "visual_detection",
      sourceText: d.possibleMeaning,
      bbox: normalizeEvidenceBBox(d.bbox, options.pageSizeByPage?.[d.page]),
      cropId: d.cropId,
      confidence: d.confidence,
      needsReview: d.needsReview,
    }));
    const allConfirmed = group.every((d) => !d.needsReview && d.confidence === "high");
    drafts.push({
      trade,
      category,
      normalizedPoint: point,
      label: POINT_LABEL[point] ?? point,
      quantity: allConfirmed ? group.length : 0,
      unit: "ks",
      quantitySource: "visual_detection",
      evidenceAnchors: anchors,
      priceStatus: "price_missing",
      currency,
      reviewStatus: allConfirmed ? "confirmed" : "needs_review",
      reviewReason: allConfirmed
        ? undefined
        : `Vizuálne nájdených ${group.length} ks — počet treba potvrdiť vo výrezoch.`,
      sortKey: stableSortKey({
        category,
        label: POINT_LABEL[point] ?? point,
        page,
        sourceText: point,
      }),
    });
  }

  // 4) Stable ordering + code assignment.
  drafts.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
    return a.sortKey.localeCompare(b.sortKey);
  });

  const counters = new Map<string, number>();
  return drafts.map((draft) => {
    const prefix = positionCategoryCode(trade, draft.category);
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    const positionCode = `${prefix}-${String(n).padStart(3, "0")}`;
    const { sortKey: _sortKey, ...rest } = draft;
    return { ...rest, id: `pos_${positionCode}`, positionCode };
  });
}

/** Fallback: build positions from setup material rows when facts are unavailable. */
export function buildPositionsFromMaterialRows(
  rows: Array<{
    id: string;
    name: string;
    qty: number;
    unit: string;
    price: number;
    included: boolean;
    confidence?: "low" | "medium" | "high";
    group?: string;
    sourceNote?: string;
  }>,
  options: { fileName: string; trade?: EstimatorPositionTrade; currency?: string }
): EstimatorPosition[] {
  const trade = options.trade ?? "electrical";
  const GROUP_TO_CATEGORY: Record<string, string> = {
    socket: "socket",
    switch: "switch",
    lighting: "lighting",
    led: "led_strip",
    cable: "cable",
    install: "installation_material",
    labor: "labor",
    other: "other",
  };
  const drafts = rows
    .filter((r) => r.included && r.name.trim())
    .map((r) => {
      const category = GROUP_TO_CATEGORY[r.group ?? "other"] ?? "other";
      return {
        row: r,
        category,
        sortKey: stableSortKey({
          category,
          label: r.name,
          page: 1,
          sourceText: r.sourceNote ?? r.name,
        }),
      };
    })
    .sort((a, b) => {
      const ca = CATEGORY_ORDER.indexOf(a.category);
      const cb = CATEGORY_ORDER.indexOf(b.category);
      if (ca !== cb) return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
      return a.sortKey.localeCompare(b.sortKey);
    });

  const counters = new Map<string, number>();
  return drafts.map(({ row, category }) => {
    const prefix = positionCategoryCode(trade, category);
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    const positionCode = `${prefix}-${String(n).padStart(3, "0")}`;
    const priced = row.price > 0;
    return {
      id: `pos_${positionCode}`,
      positionCode,
      trade,
      category,
      normalizedPoint: category,
      label: row.name.trim(),
      quantity: row.qty > 0 ? row.qty : 0,
      unit: toPositionUnit(row.unit),
      quantitySource: "ai_estimate" as const,
      evidenceAnchors: [
        {
          id: `anchor_row_${row.id}`,
          fileName: options.fileName,
          page: 1,
          sourceType: "ai_inferred" as const,
          sourceText: row.sourceNote || row.name,
          confidence: row.confidence ?? "medium",
          needsReview: !priced || row.qty <= 0,
        },
      ],
      priceStatus: priced ? ("priced" as const) : ("price_missing" as const),
      unitPrice: priced ? row.price : undefined,
      totalPrice: priced && row.qty > 0 ? Number((row.price * row.qty).toFixed(2)) : undefined,
      currency: options.currency ?? "EUR",
      linkedMaterialRowId: row.id,
      reviewStatus: "needs_review" as const,
    };
  });
}

/** Link positions to editable material rows by name (best effort, additive). */
export function linkPositionsToMaterialRows(
  positions: EstimatorPosition[],
  rows: Array<{ id: string; name: string; price: number }>
): EstimatorPosition[] {
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r] as const));
  return positions.map((p) => {
    const row = byName.get(p.label.trim().toLowerCase());
    if (!row) return p;
    const priced = row.price > 0;
    return {
      ...p,
      linkedMaterialRowId: row.id,
      priceStatus: priced && p.priceStatus === "price_missing" ? "priced" : p.priceStatus,
      unitPrice: priced ? row.price : p.unitPrice,
      totalPrice:
        priced && p.quantity > 0 ? Number((row.price * p.quantity).toFixed(2)) : p.totalPrice,
    };
  });
}

// ---------------------------------------------------------------------------
// PDF overlay annotations
// ---------------------------------------------------------------------------

export function buildPdfOverlayAnnotations(
  positions: EstimatorPosition[]
): PdfOverlayAnnotation[] {
  const annotations: PdfOverlayAnnotation[] = [];
  for (const p of positions) {
    if (p.reviewStatus === "ignored" || p.reviewStatus === "excluded") continue;
    for (const anchor of p.evidenceAnchors) {
      if (!anchor.bbox) continue;
      annotations.push({
        id: `ann_${anchor.id}`,
        evidenceAnchorId: anchor.id,
        positionId: p.id,
        page: anchor.page,
        bbox: anchor.bbox,
        rawSelectionBbox: anchor.rawSelectionBbox,
        tightSymbolBbox: anchor.tightSymbolBbox,
        markStatus: anchor.markStatus,
        polygon: anchor.polygon,
        isManualMark: isManualMarkAnchor(anchor),
        label: p.label || p.positionCode,
        colorKey:
          anchor.markStatus === "outside_plan"
            ? "warning"
            : p.reviewStatus === "needs_review" && p.category === "unknown"
              ? "warning"
              : overlayColorKeyForCategory(p.category),
        needsReview:
          anchor.needsReview ||
          anchor.markStatus === "needs_review" ||
          anchor.markStatus === "outside_plan" ||
          p.reviewStatus === "needs_review",
      });
    }
  }
  return annotations;
}

/** Selection state sync: list row click ↔ PDF annotation highlight. */
export function applyAnnotationSelection(
  annotations: PdfOverlayAnnotation[],
  selectedPositionId: string | null,
  selectedAnchorId?: string | null
): PdfOverlayAnnotation[] {
  return annotations.map((a) => {
    if (selectedAnchorId) {
      return {
        ...a,
        selected: a.evidenceAnchorId === selectedAnchorId,
      };
    }
    return {
      ...a,
      selected: selectedPositionId != null && a.positionId === selectedPositionId,
    };
  });
}

/** Quick category change when user classifies a symbol (zásuvka / svetlo / vypínač). */
export function categoryToNormalizedPoint(category: string): string {
  switch (category) {
    case "socket":
      return "socket_point";
    case "double_socket":
      return "double_socket_point";
    case "switch":
      return "switch_point";
    case "lighting":
    case "light":
      return "light_output";
    case "led_strip":
    case "led":
      return "led_strip";
    case "cable":
      return "cable_run";
    default:
      return category;
  }
}

export function setPositionCategory(
  position: EstimatorPosition,
  category: string
): EstimatorPosition {
  if (position.category === category) return position;
  return {
    ...position,
    category,
    normalizedPoint: categoryToNormalizedPoint(category),
  };
}

/** Manual marks for a position, newest last. */
export function manualMarksOf(position: EstimatorPosition): EstimatorEvidenceAnchor[] {
  return position.evidenceAnchors.filter(isManualMarkAnchor);
}

/** Reverse lookup: clicking an annotation selects the linked position. */
export function positionIdForAnnotation(
  annotations: PdfOverlayAnnotation[],
  annotationId: string
): string | null {
  return annotations.find((a) => a.id === annotationId)?.positionId ?? null;
}

// ---------------------------------------------------------------------------
// Filters + sorting (Phase 5)
// ---------------------------------------------------------------------------

export type PositionQuickFilter =
  | "price_missing"
  | "needs_review"
  | "no_pdf_position"
  | "drawing_only"
  | "legend_only"
  | "schedule_only"
  | "manual_only"
  | "conflicts";

export type PositionFilters = {
  trade?: EstimatorPositionTrade;
  category?: string;
  roomName?: string;
  quantitySource?: EstimatorQuantitySource;
  priceStatus?: EstimatorPriceStatus;
  reviewStatus?: EstimatorReviewStatus;
  confidence?: "high" | "medium" | "low";
  hasEvidence?: boolean;
  hasBbox?: boolean;
  needsReview?: boolean;
  /**
   * When true (default), ignored/excluded positions are hidden from Ceny/Detail.
   * Set false only for admin/debug views that need to show inactive rows.
   */
  includeInactive?: boolean;
  /**
   * When true, only positions with a real plan mark (bbox) are shown.
   * AI estimates without PDF/plan evidence are not accepted as price lines.
   */
  requirePlanMark?: boolean;
  quick?: PositionQuickFilter;
  search?: string;
  /** Multi-document: show only positions with evidence in this document. */
  documentId?: string;
  documentFileName?: string;
  documentFileId?: string;
  /** Position ids with open quantity conflicts. */
  conflictPositionIds?: Set<string>;
};

function positionConfidence(p: EstimatorPosition): "high" | "medium" | "low" {
  const order = { low: 0, medium: 1, high: 2 } as const;
  return p.evidenceAnchors.reduce<"high" | "medium" | "low">(
    (min, a) => (order[a.confidence] < order[min] ? a.confidence : min),
    "high"
  );
}

function positionHasBbox(p: EstimatorPosition): boolean {
  return p.evidenceAnchors.some((a) => a.bbox != null);
}

function positionMatchesDocument(
  p: EstimatorPosition,
  documentId: string,
  fileName?: string,
  fileId?: string
): boolean {
  if ((p.sourceDocuments ?? []).includes(documentId)) return true;
  return p.evidenceAnchors.some(
    (a) =>
      a.documentId === documentId ||
      (fileName && a.fileName === fileName) ||
      (fileId && a.fileId === fileId)
  );
}

/** Primary source document label for table display. */
export function primarySourceDocumentLabel(
  p: EstimatorPosition,
  documents: Array<{ id: string; fileName: string }>
): string {
  const docId = p.sourceDocuments?.[0] ?? p.evidenceAnchors[0]?.documentId;
  if (docId) {
    const match = documents.find((d) => d.id === docId);
    if (match) return match.fileName;
  }
  const fileName = p.evidenceAnchors[0]?.fileName;
  return fileName ?? "—";
}

export function filterEstimatorPositions(
  positions: EstimatorPosition[],
  f: PositionFilters
): EstimatorPosition[] {
  const q = f.search?.trim().toLowerCase();
  const includeInactive = f.includeInactive === true;
  const requirePlanMark = f.requirePlanMark === true;
  return positions.filter((p) => {
    if (
      !includeInactive &&
      (p.reviewStatus === "ignored" || p.reviewStatus === "excluded")
    ) {
      return false;
    }
    // "Bez pozície v PDF" is the only quick filter that should list unmarked rows.
    if (
      requirePlanMark &&
      f.quick !== "no_pdf_position" &&
      !positionHasBbox(p)
    ) {
      return false;
    }
    if (f.documentId) {
      if (
        !positionMatchesDocument(
          p,
          f.documentId,
          f.documentFileName,
          f.documentFileId
        )
      ) {
        return false;
      }
    }
    if (f.trade && p.trade !== f.trade) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.roomName && (p.roomName ?? "").toLowerCase() !== f.roomName.toLowerCase())
      return false;
    if (f.quantitySource && p.quantitySource !== f.quantitySource) return false;
    if (f.priceStatus && p.priceStatus !== f.priceStatus) return false;
    if (f.reviewStatus && p.reviewStatus !== f.reviewStatus) return false;
    if (f.confidence && positionConfidence(p) !== f.confidence) return false;
    if (f.hasEvidence != null && (p.evidenceAnchors.length > 0) !== f.hasEvidence)
      return false;
    if (f.hasBbox != null && positionHasBbox(p) !== f.hasBbox) return false;
    if (f.needsReview != null && (p.reviewStatus === "needs_review") !== f.needsReview)
      return false;
    if (f.quick) {
      switch (f.quick) {
        case "price_missing":
          if (p.priceStatus !== "price_missing") return false;
          break;
        case "needs_review":
          if (p.reviewStatus !== "needs_review") return false;
          break;
        case "no_pdf_position":
          if (positionHasBbox(p)) return false;
          break;
        case "drawing_only":
          // "Z PDF" — any position with a plan mark / bbox.
          if (!positionHasBbox(p)) return false;
          break;
        case "legend_only":
          if (!p.evidenceAnchors.every((a) => a.sourceType === "project_legend"))
            return false;
          break;
        case "schedule_only":
          if (
            p.quantitySource !== "schedule" &&
            !p.evidenceAnchors.some((a) => a.sourceType === "schedule_table")
          )
            return false;
          break;
        case "conflicts":
          if (!f.conflictPositionIds?.has(p.id)) return false;
          break;
        case "manual_only":
          if (
            p.quantitySource !== "manual" &&
            p.priceStatus !== "manual_price" &&
            !p.evidenceAnchors.some((a) => a.sourceType === "manual")
          )
            return false;
          break;
      }
    }
    if (q) {
      const haystack = `${p.positionCode} ${p.label} ${p.roomName ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export type PositionSortKey =
  | "positionCode"
  | "roomName"
  | "label"
  | "quantity"
  | "priceStatus"
  | "totalPrice"
  | "confidence"
  | "reviewStatus";

export function sortEstimatorPositions(
  positions: EstimatorPosition[],
  key: PositionSortKey,
  direction: "asc" | "desc" = "asc"
): EstimatorPosition[] {
  const dir = direction === "asc" ? 1 : -1;
  const confOrder = { low: 0, medium: 1, high: 2 } as const;
  const reviewOrder = { needs_review: 0, confirmed: 1, ignored: 2, excluded: 3 } as const;
  return [...positions].sort((a, b) => {
    switch (key) {
      case "quantity":
        return (a.quantity - b.quantity) * dir;
      case "totalPrice":
        return ((a.totalPrice ?? -1) - (b.totalPrice ?? -1)) * dir;
      case "confidence":
        return (confOrder[positionConfidence(a)] - confOrder[positionConfidence(b)]) * dir;
      case "reviewStatus":
        return (reviewOrder[a.reviewStatus] - reviewOrder[b.reviewStatus]) * dir;
      case "roomName":
        return (a.roomName ?? "").localeCompare(b.roomName ?? "") * dir;
      case "label":
        return a.label.localeCompare(b.label) * dir;
      case "priceStatus":
        return a.priceStatus.localeCompare(b.priceStatus) * dir;
      default:
        return a.positionCode.localeCompare(b.positionCode) * dir;
    }
  });
}

// ---------------------------------------------------------------------------
// Price workflow (Phase 6)
// ---------------------------------------------------------------------------

/** Manual price. Rejects 0/negative — never silently price at 0 €. */
export function applyManualPriceToPosition(
  position: EstimatorPosition,
  unitPrice: number,
  currency?: string
): EstimatorPosition {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return position;
  return {
    ...position,
    priceStatus: "manual_price",
    unitPrice: Number(unitPrice.toFixed(2)),
    totalPrice:
      position.quantity > 0 ? Number((unitPrice * position.quantity).toFixed(2)) : undefined,
    currency: currency ?? position.currency,
  };
}

export function applyCatalogPriceToPosition(
  position: EstimatorPosition,
  price: {
    unitPrice: number;
    sourceType: "company_pricebook" | "supplier_catalog" | "imported_csv_pricebook";
    productName?: string;
    supplierId?: string;
    currency?: string;
  }
): EstimatorPosition {
  if (!Number.isFinite(price.unitPrice) || price.unitPrice <= 0) return position;
  const priceStatus: EstimatorPriceStatus =
    price.sourceType === "company_pricebook" ? "company_pricebook" : "supplier_catalog";
  return {
    ...position,
    priceStatus,
    unitPrice: Number(price.unitPrice.toFixed(2)),
    totalPrice:
      position.quantity > 0
        ? Number((price.unitPrice * position.quantity).toFixed(2))
        : undefined,
    currency: price.currency ?? position.currency,
    productRef: {
      productName: price.productName,
      supplierId: price.supplierId,
      sourceType: price.sourceType,
    },
  };
}

export function markPositionCustomerSupplied(
  position: EstimatorPosition
): EstimatorPosition {
  return {
    ...position,
    priceStatus: "customer_supplied",
    unitPrice: undefined,
    totalPrice: undefined,
    productRef: undefined,
  };
}

/** How many other price_missing positions would receive "apply to similar". */
export function countSimilarPricelessPositions(
  positions: EstimatorPosition[],
  source: EstimatorPosition
): number {
  return positions.filter(
    (p) =>
      p.id !== source.id &&
      p.reviewStatus !== "ignored" &&
      p.reviewStatus !== "excluded" &&
      p.priceStatus === "price_missing" &&
      (p.normalizedPoint === source.normalizedPoint || p.category === source.category)
  ).length;
}

/** Apply a price to all price_missing positions with the same normalizedPoint/category. */
export function applyPriceToSimilarPositions(
  positions: EstimatorPosition[],
  source: EstimatorPosition
): EstimatorPosition[] {
  if (source.unitPrice == null || source.unitPrice <= 0) return positions;
  return positions.map((p) => {
    if (p.id === source.id) return source;
    if (p.priceStatus !== "price_missing") return p;
    if (p.normalizedPoint !== source.normalizedPoint && p.category !== source.category)
      return p;
    return {
      ...p,
      priceStatus: source.priceStatus,
      unitPrice: source.unitPrice,
      totalPrice:
        p.quantity > 0 ? Number((source.unitPrice! * p.quantity).toFixed(2)) : undefined,
      currency: source.currency ?? p.currency,
      productRef: source.productRef,
    };
  });
}

// ---------------------------------------------------------------------------
// Review actions (Phase 8)
// ---------------------------------------------------------------------------

export const POSITION_EXCLUDE_REASONS = [
  "duplicate",
  "false_detection",
  "out_of_scope",
  "customer_supplied",
  "not_quoted",
  "other",
] as const;

export type PositionExcludeReason = (typeof POSITION_EXCLUDE_REASONS)[number];

export function confirmPosition(position: EstimatorPosition): EstimatorPosition {
  return {
    ...position,
    reviewStatus: "confirmed",
    reviewReason: undefined,
    evidenceAnchors: position.evidenceAnchors.map((a) =>
      a.needsReview ? { ...a, needsReview: false, sourceType: "user_confirmed" } : a
    ),
  };
}

/** Ignore/exclude REQUIRE a reason — silent removals are not allowed. */
export function ignorePosition(
  position: EstimatorPosition,
  reason: PositionExcludeReason | string
): EstimatorPosition {
  if (!String(reason).trim()) {
    throw new Error("Ignoring a position requires a reason.");
  }
  return { ...position, reviewStatus: "ignored", reviewReason: String(reason) };
}

export function excludePositionFromQuote(
  position: EstimatorPosition,
  reason: PositionExcludeReason | string
): EstimatorPosition {
  if (!String(reason).trim()) {
    throw new Error("Excluding a position requires a reason.");
  }
  return { ...position, reviewStatus: "excluded", reviewReason: String(reason) };
}

// ---------------------------------------------------------------------------
// Manual plan marking ("aby som na nič nezabudol")
// ---------------------------------------------------------------------------

const MANUAL_MARK_PREFIX = "mark_";

function newManualMarkId(): string {
  return `${MANUAL_MARK_PREFIX}${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function isManualMarkAnchor(anchor: EstimatorEvidenceAnchor): boolean {
  return (
    (anchor.sourceType === "manual" || anchor.sourceType === "user_confirmed") &&
    anchor.id.startsWith(MANUAL_MARK_PREFIX) &&
    anchor.markStatus !== "outside_plan"
  );
}

/** All manual marks including outside-plan (for UI warnings). */
export function isAnyManualMarkAnchor(anchor: EstimatorEvidenceAnchor): boolean {
  return anchor.sourceType === "manual" && anchor.id.startsWith(MANUAL_MARK_PREFIX);
}

export function manualMarkCount(position: EstimatorPosition): number {
  return position.evidenceAnchors.filter(isManualMarkAnchor).length;
}

/**
 * How many marks a position needs to count as "fully marked".
 * Piece counts (ks) expect one mark per piece; other units just need one locate.
 */
export function positionMarkTarget(position: EstimatorPosition): number {
  if (position.unit === "ks" && position.quantity > 0) {
    return Math.round(position.quantity);
  }
  return 1;
}

/** A position counts as "marked in the plan" once every expected piece is marked. */
export function isPositionMarked(position: EstimatorPosition): boolean {
  return manualMarkCount(position) >= positionMarkTarget(position);
}

/**
 * Add a manual mark (user clicked or traced a shape in the plan) as an
 * evidence anchor. Shows up as a PDF overlay annotation and persists.
 */
export function addManualMarkToPosition(
  position: EstimatorPosition,
  mark: {
    page: number;
    bbox: EstimatorPositionBBox;
    fileName: string;
    documentId?: string;
    fileId?: string;
    polygon?: Array<{ x: number; y: number }>;
    rawSelectionBbox?: EstimatorPositionBBox;
    tightSymbolBbox?: EstimatorPositionBBox;
    markStatus?:
      | "confirmed"
      | "outside_plan"
      | "needs_review"
      | "inside_plan"
      | "boundary_uncertain"
      | "in_legend_or_table";
    needsReview?: boolean;
    cropId?: string;
  }
): EstimatorPosition {
  const evidenceBbox = mark.tightSymbolBbox ?? mark.bbox;
  const status = mark.markStatus ?? (mark.needsReview ? "needs_review" : "confirmed");
  const anchor: EstimatorEvidenceAnchor = {
    id: newManualMarkId(),
    documentId: mark.documentId,
    fileId: mark.fileId,
    fileName: mark.fileName,
    page: mark.page > 0 ? mark.page : 1,
    sourceType: "manual",
    sourceText:
      status === "outside_plan"
        ? "Značka mimo pôdorysu"
        : status === "in_legend_or_table"
          ? "Značka v legende / tabuľke"
          : status === "boundary_uncertain"
            ? "Značka pri hranici pôdorysu"
            : "Ručné označenie v pláne",
    bbox: {
      x: clamp01(evidenceBbox.x),
      y: clamp01(evidenceBbox.y),
      width: clamp01(evidenceBbox.width),
      height: clamp01(evidenceBbox.height),
    },
    rawSelectionBbox: mark.rawSelectionBbox
      ? {
          x: clamp01(mark.rawSelectionBbox.x),
          y: clamp01(mark.rawSelectionBbox.y),
          width: clamp01(mark.rawSelectionBbox.width),
          height: clamp01(mark.rawSelectionBbox.height),
        }
      : undefined,
    tightSymbolBbox: mark.tightSymbolBbox
      ? {
          x: clamp01(mark.tightSymbolBbox.x),
          y: clamp01(mark.tightSymbolBbox.y),
          width: clamp01(mark.tightSymbolBbox.width),
          height: clamp01(mark.tightSymbolBbox.height),
        }
      : undefined,
    markStatus: status,
    polygon: mark.polygon?.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) })),
    cropId: mark.cropId,
    confidence: status === "outside_plan" ? "low" : "high",
    needsReview:
      mark.needsReview ??
      (status === "needs_review" ||
        status === "boundary_uncertain" ||
        status === "in_legend_or_table"),
  };
  return {
    ...position,
    evidenceAnchors: [...position.evidenceAnchors, anchor],
  };
}

/** Add similar-symbol candidate marks (needs review, not counted until confirmed). */
export function addSimilarCandidateMarksToPosition(
  position: EstimatorPosition,
  marks: Array<{
    page: number;
    bbox: EstimatorPositionBBox;
    matchScore: number;
    fileName: string;
    documentId?: string;
    fileId?: string;
  }>,
  options?: { referenceBbox?: EstimatorPositionBBox; prefiltered?: boolean }
): EstimatorPosition {
  if (marks.length === 0) return position;
  const accepted = options?.prefiltered
    ? marks
    : filterSimilarCandidateMarks(marks, {
        referenceBbox: options?.referenceBbox,
      }).accepted;
  if (accepted.length === 0) return position;
  const existing = position.evidenceAnchors.filter((a) => a.bbox);
  const newAnchors: EstimatorEvidenceAnchor[] = [];
  for (const m of accepted) {
    const bbox = {
      x: clamp01(m.bbox.x),
      y: clamp01(m.bbox.y),
      width: clamp01(m.bbox.width),
      height: clamp01(m.bbox.height),
    };
    const duplicate = existing.some(
      (a) =>
        a.page === m.page &&
        a.bbox != null &&
        boxesNearDuplicate(a.bbox, bbox)
    );
    if (duplicate) continue;
    if (
      newAnchors.some(
        (a) => a.page === m.page && a.bbox != null && boxesNearDuplicate(a.bbox, bbox)
      )
    ) {
      continue;
    }
    newAnchors.push({
      id: `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      documentId: m.documentId,
      fileId: m.fileId,
      fileName: m.fileName,
      page: m.page,
      sourceType: "visual_detection",
      sourceText: `Podobná značka (${Math.round(m.matchScore * 100)}%)`,
      bbox,
      confidence: m.matchScore >= 0.9 ? "high" : "medium",
      needsReview: true,
      markStatus: "needs_review",
    });
  }
  if (newAnchors.length === 0) return position;
  return {
    ...position,
    evidenceAnchors: [...position.evidenceAnchors, ...newAnchors],
  };
}

/**
 * Add similar matches and immediately confirm them as counted marks.
 * Used when the user wants quantity to jump without a review step.
 */
export function addAndConfirmSimilarMarksToPosition(
  position: EstimatorPosition,
  marks: Array<{
    page: number;
    bbox: EstimatorPositionBBox;
    matchScore: number;
    fileName: string;
    documentId?: string;
    fileId?: string;
  }>
): EstimatorPosition {
  return confirmSimilarCandidateMarks(
    addSimilarCandidateMarksToPosition(position, marks)
  );
}

const SIMILAR_CANDIDATE_PREFIX = "sim_";

/** Unconfirmed similar-symbol candidates (do not count toward quantity). */
export function similarCandidateAnchors(
  position: EstimatorPosition
): EstimatorEvidenceAnchor[] {
  return position.evidenceAnchors.filter(
    (a) =>
      a.id.startsWith(SIMILAR_CANDIDATE_PREFIX) &&
      a.sourceType === "visual_detection" &&
      a.needsReview
  );
}

/**
 * User confirmed the similar-symbol candidates: convert them into regular
 * manual marks (counted by manualMarkCount) and update the quantity.
 */
export function confirmSimilarCandidateMarks(
  position: EstimatorPosition
): EstimatorPosition {
  const candidates = similarCandidateAnchors(position);
  if (candidates.length === 0) return position;
  const candidateIds = new Set(candidates.map((a) => a.id));
  const next: EstimatorPosition = {
    ...position,
    evidenceAnchors: position.evidenceAnchors.map((a) =>
      candidateIds.has(a.id)
        ? {
            ...a,
            id: `${MANUAL_MARK_PREFIX}${a.id}`,
            sourceType: "user_confirmed" as const,
            needsReview: false,
            markStatus: "confirmed" as const,
            confidence: "high" as const,
          }
        : a
    ),
  };
  return applyMarkCountAsQuantity(next);
}

/** User dismissed the similar-symbol candidates: drop them without counting. */
export function removeSimilarCandidateMarks(
  position: EstimatorPosition
): EstimatorPosition {
  const candidates = similarCandidateAnchors(position);
  if (candidates.length === 0) return position;
  const candidateIds = new Set(candidates.map((a) => a.id));
  return {
    ...position,
    evidenceAnchors: position.evidenceAnchors.filter((a) => !candidateIds.has(a.id)),
  };
}

export function isSimilarCandidateAnchor(anchor: EstimatorEvidenceAnchor): boolean {
  return (
    anchor.id.startsWith(SIMILAR_CANDIDATE_PREFIX) &&
    anchor.sourceType === "visual_detection" &&
    Boolean(anchor.needsReview)
  );
}

/** @deprecated use SIMILAR_ACCEPTED_MIN from strictSimilarMatch */
export const SIMILAR_CANDIDATE_MIN_SCORE = 0.85;
/** Cap accepted PDF markers. */
export const SIMILAR_CANDIDATE_MAX_VISIBLE = 20;

/**
 * Filter find-similar hits with strict geometry + score bands.
 * Only `accepted` attach to PDF by default; `uncertain` stay in review list.
 */
export function filterSimilarCandidateMarks<
  T extends { matchScore: number; page?: number; bbox?: EstimatorPositionBBox },
>(
  marks: T[],
  options?: {
    minScore?: number;
    maxVisible?: number;
    referenceBbox?: EstimatorPositionBBox;
  }
): {
  accepted: T[];
  uncertain: T[];
  rejected: T[];
  rejectedLow: number;
  truncated: number;
} {
  const maxVisible = options?.maxVisible ?? SIMILAR_CANDIDATE_MAX_VISIBLE;
  const reference = options?.referenceBbox;
  if (!reference) {
    const minScore = options?.minScore ?? SIMILAR_ACCEPTED_MIN;
    const ranked = [...marks].sort((a, b) => b.matchScore - a.matchScore);
    const good = ranked.filter((m) => m.matchScore >= minScore);
    const uncertain = ranked.filter(
      (m) => m.matchScore >= SIMILAR_UNCERTAIN_MIN && m.matchScore < minScore
    );
    const accepted = good.slice(0, maxVisible);
    return {
      accepted,
      uncertain,
      rejected: ranked.filter((m) => m.matchScore < SIMILAR_UNCERTAIN_MIN),
      rejectedLow: ranked.length - good.length - uncertain.length,
      truncated: Math.max(0, good.length - accepted.length),
    };
  }
  const hits: Array<T & StrictSimilarHit> = marks
    .filter((m): m is T & { bbox: EstimatorPositionBBox } => m.bbox != null)
    .map((m) => ({
      ...m,
      page: m.page ?? 1,
      bbox: m.bbox,
      matchScore: m.matchScore,
    }));
  const buckets = bucketStrictSimilarHits(reference, hits, { maxAccepted: maxVisible });
  return {
    accepted: buckets.accepted,
    uncertain: buckets.uncertain,
    rejected: buckets.rejected,
    rejectedLow: buckets.rejected.length,
    truncated: 0,
  };
}

export type RemoveAnchorPlan =
  | { kind: "candidate"; position: EstimatorPosition }
  | { kind: "mark"; position: EstimatorPosition }
  | { kind: "only_occurrence"; position: EstimatorPosition; anchorId: string };

/** Plan delete of one evidence anchor (candidate vs confirmed mark). */
export function planRemoveEvidenceAnchor(
  position: EstimatorPosition,
  anchorId: string
): RemoveAnchorPlan | null {
  const anchor = position.evidenceAnchors.find((a) => a.id === anchorId);
  if (!anchor) return null;
  if (isSimilarCandidateAnchor(anchor)) {
    return {
      kind: "candidate",
      position: {
        ...position,
        evidenceAnchors: position.evidenceAnchors.filter((a) => a.id !== anchorId),
      },
    };
  }
  const countedMarks = position.evidenceAnchors.filter(
    (a) => isManualMarkAnchor(a) || a.sourceType === "user_confirmed"
  );
  const isCounted =
    isManualMarkAnchor(anchor) ||
    (anchor.sourceType === "user_confirmed" && Boolean(anchor.bbox));
  if (!isCounted) {
    return {
      kind: "candidate",
      position: {
        ...position,
        evidenceAnchors: position.evidenceAnchors.filter((a) => a.id !== anchorId),
      },
    };
  }
  if (countedMarks.length <= 1) {
    return { kind: "only_occurrence", position, anchorId };
  }
  const nextAnchors = position.evidenceAnchors.filter((a) => a.id !== anchorId);
  const next = applyMarkCountAsQuantity({ ...position, evidenceAnchors: nextAnchors });
  return { kind: "mark", position: next };
}

/** Remove mark but keep the position (quantity may become 0). */
export function removeCountedMarkKeepPosition(
  position: EstimatorPosition,
  anchorId: string
): EstimatorPosition {
  const nextAnchors = position.evidenceAnchors.filter((a) => a.id !== anchorId);
  const next = { ...position, evidenceAnchors: nextAnchors };
  const count = manualMarkCount(next);
  return {
    ...next,
    quantity: count,
    quantitySource: count > 0 ? "manual" : next.quantitySource,
    totalPrice:
      next.unitPrice != null && next.unitPrice > 0 && count > 0
        ? Number((next.unitPrice * count).toFixed(2))
        : count === 0
          ? undefined
          : next.totalPrice,
  };
}

/** Bulk-remove anchors. Candidates drop; counted marks update quantity. */
export function removeEvidenceAnchorsBulk(
  positions: EstimatorPosition[],
  refs: Array<{ positionId: string; anchorId: string }>
): EstimatorPosition[] {
  if (refs.length === 0) return positions;
  const byPos = new Map<string, Set<string>>();
  for (const r of refs) {
    const set = byPos.get(r.positionId) ?? new Set();
    set.add(r.anchorId);
    byPos.set(r.positionId, set);
  }
  return positions.map((p) => {
    const ids = byPos.get(p.id);
    if (!ids) return p;
    let next = p;
    for (const anchorId of ids) {
      const plan = planRemoveEvidenceAnchor(next, anchorId);
      if (!plan) continue;
      if (plan.kind === "candidate" || plan.kind === "mark") {
        next = plan.position;
      } else {
        next = removeCountedMarkKeepPosition(next, anchorId);
      }
    }
    return next;
  });
}

/** Drop only candidate anchors matching ids (qty unchanged). */
export function removeCandidateAnchorsBulk(
  positions: EstimatorPosition[],
  refs: Array<{ positionId: string; anchorId: string }>
): EstimatorPosition[] {
  if (refs.length === 0) return positions;
  const byPos = new Map<string, Set<string>>();
  for (const r of refs) {
    const set = byPos.get(r.positionId) ?? new Set();
    set.add(r.anchorId);
    byPos.set(r.positionId, set);
  }
  return positions.map((p) => {
    const ids = byPos.get(p.id);
    if (!ids) return p;
    const nextAnchors = p.evidenceAnchors.filter(
      (a) => !(ids.has(a.id) && isSimilarCandidateAnchor(a))
    );
    if (nextAnchors.length === p.evidenceAnchors.length) return p;
    return { ...p, evidenceAnchors: nextAnchors };
  });
}

/** Rename what the article/position is (user overrides AI/legend naming). */
export function renamePositionLabel(
  position: EstimatorPosition,
  label: string
): EstimatorPosition {
  const next = label.trim();
  if (!next || next === position.label) return position;
  return { ...position, label: next };
}

/** Use the number of placed marks as the piece count ("počet kusov podľa značiek"). */
export function applyMarkCountAsQuantity(
  position: EstimatorPosition
): EstimatorPosition {
  const count = manualMarkCount(position);
  if (count <= 0 || count === position.quantity) return position;
  return {
    ...position,
    quantity: count,
    unit: position.unit === "unknown" ? "ks" : position.unit,
    quantitySource: "manual",
    totalPrice:
      position.unitPrice != null && position.unitPrice > 0
        ? Number((position.unitPrice * count).toFixed(2))
        : position.totalPrice,
  };
}

/** Remove one manual mark (specific anchor, or the last one when id omitted). */
export function removeManualMarkFromPosition(
  position: EstimatorPosition,
  anchorId?: string
): EstimatorPosition {
  const marks = position.evidenceAnchors.filter(isManualMarkAnchor);
  if (marks.length === 0) return position;
  const removeId = anchorId ?? marks[marks.length - 1]!.id;
  return {
    ...position,
    evidenceAnchors: position.evidenceAnchors.filter((a) => a.id !== removeId),
  };
}

export type MarkingProgress = {
  total: number;
  marked: number;
  unmarked: number;
  /** Position ids still waiting for a mark, in list order. */
  unmarkedIds: string[];
  /** Total number of manual marks placed across all positions. */
  markCount: number;
};

/** Progress over active (non-ignored/excluded) positions. */
export function summarizeMarkingProgress(
  positions: EstimatorPosition[]
): MarkingProgress {
  const active = positions.filter(
    (p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded"
  );
  const unmarkedIds = active.filter((p) => !isPositionMarked(p)).map((p) => p.id);
  return {
    total: active.length,
    marked: active.length - unmarkedIds.length,
    unmarked: unmarkedIds.length,
    unmarkedIds,
    markCount: active.reduce((s, p) => s + manualMarkCount(p), 0),
  };
}

export type ArticleCountRow = {
  positionId: string;
  positionCode: string;
  label: string;
  quantity: number;
  unit: string;
  markCount: number;
};

/** Final result of the marking workflow: article list with piece counts. */
export function summarizeArticleCounts(
  positions: EstimatorPosition[]
): ArticleCountRow[] {
  return positions
    .filter((p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded")
    .map((p) => ({
      positionId: p.id,
      positionCode: p.positionCode,
      label: p.label,
      quantity: p.quantity,
      unit: p.unit === "unknown" ? "ks" : p.unit,
      markCount: manualMarkCount(p),
    }));
}

/** Next unmarked position after the currently selected one (wraps around). */
export function nextUnmarkedPositionId(
  positions: EstimatorPosition[],
  selectedPositionId: string | null
): string | null {
  const { unmarkedIds } = summarizeMarkingProgress(positions);
  if (unmarkedIds.length === 0) return null;
  if (!selectedPositionId) return unmarkedIds[0]!;
  const active = positions.filter(
    (p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded"
  );
  const startIndex = active.findIndex((p) => p.id === selectedPositionId);
  if (startIndex === -1) return unmarkedIds[0]!;
  for (let step = 1; step <= active.length; step += 1) {
    const candidate = active[(startIndex + step) % active.length]!;
    if (!isPositionMarked(candidate)) return candidate.id;
  }
  return unmarkedIds[0]!;
}

// ---------------------------------------------------------------------------
// Quote safety (Phase 10)
// ---------------------------------------------------------------------------

const CRITICAL_CATEGORIES = new Set([
  "socket",
  "switch",
  "lighting",
  "led_strip",
  "cable",
  "distribution_board",
]);

export type PositionsQuoteSafety = {
  blocked: boolean;
  reasons: string[];
};

export function positionsBlockFixedQuote(
  positions: EstimatorPosition[],
  options?: {
    openConflicts?: EstimatorQuantityConflict[];
  }
): PositionsQuoteSafety {
  const reasons: string[] = [];
  const active = positions.filter(
    (p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded"
  );

  const openConflictCount =
    options?.openConflicts?.filter((c) => c.status === "open").length ?? 0;
  if (openConflictCount > 0) {
    reasons.push(
      `${openConflictCount} rozdielov medzi dokumentmi čaká na vyriešenie.`
    );
  }

  const needsReview = active.filter((p) => p.reviewStatus === "needs_review");
  if (needsReview.length > 0) {
    reasons.push(`${needsReview.length} pozícií čaká na kontrolu.`);
  }
  const priceMissing = active.filter(
    (p) => p.priceStatus === "price_missing" && p.category !== "labor"
  );
  if (priceMissing.length > 0) {
    reasons.push(`${priceMissing.length} pozícií nemá cenu.`);
  }
  const aiCritical = active.filter(
    (p) =>
      (p.quantitySource === "ai_estimate" || p.quantitySource === "technical_report") &&
      CRITICAL_CATEGORIES.has(p.category)
  );
  if (aiCritical.length > 0) {
    reasons.push(
      `${aiCritical.length} kritických pozícií má len AI/technickú správu množstva — treba overiť.`
    );
  }
  const scheduleUnconfirmed = active.filter(
    (p) =>
      p.quantitySource === "schedule" &&
      p.reviewStatus !== "confirmed" &&
      p.category !== "labor"
  );
  if (scheduleUnconfirmed.length > 0) {
    reasons.push(
      `${scheduleUnconfirmed.length} položiek z výkazu nie je potvrdených.`
    );
  }
  const noEvidence = active.filter(
    (p) =>
      p.evidenceAnchors.length === 0 &&
      (p.quantitySource === "drawing_detection" || p.quantitySource === "visual_detection")
  );
  if (noEvidence.length > 0) {
    reasons.push(`${noEvidence.length} pozícií z výkresu nemá dôkaz (evidence).`);
  }
  // Unconfirmed visual-only positions never form fixed lines.
  const visualUnconfirmed = active.filter(
    (p) => p.quantitySource === "visual_detection" && p.reviewStatus !== "confirmed"
  );
  if (visualUnconfirmed.length > 0) {
    reasons.push(
      `${visualUnconfirmed.length} vizuálnych detekcií nie je potvrdených — nemôžu byť pevné položky.`
    );
  }
  const pendingSimilar = active.filter((p) => similarCandidateAnchors(p).length > 0);
  if (pendingSimilar.length > 0) {
    const n = pendingSimilar.reduce(
      (sum, p) => sum + similarCandidateAnchors(p).length,
      0
    );
    reasons.push(
      `${n} kandidátov „Nájsť rovnaké“ čaká na potvrdenie (${pendingSimilar.length} položiek).`
    );
  }

  return { blocked: reasons.length > 0, reasons };
}

/** A position may enter a fixed quote only when confirmed + priced (or customer supplied). */
export function isPositionFixedQuoteEligible(p: EstimatorPosition): boolean {
  if (p.reviewStatus !== "confirmed") return false;
  if (p.quantity <= 0) return false;
  if (p.priceStatus === "price_missing" || p.priceStatus === "indicative") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Summary (top card metrics)
// ---------------------------------------------------------------------------

export type PositionsSummary = {
  total: number;
  priceMissing: number;
  needsReview: number;
  confirmed: number;
  withBbox: number;
  withoutBbox: number;
  anchors: number;
  annotations: number;
};

export function summarizeEstimatorPositions(
  positions: EstimatorPosition[]
): PositionsSummary {
  const active = positions.filter(
    (p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded"
  );
  const planBacked = active.filter((p) => positionHasBbox(p));
  const annotations = buildPdfOverlayAnnotations(positions);
  return {
    // Accepted takeoff = plan-backed only (AI without PDF mark is not accepted).
    total: planBacked.length,
    priceMissing: planBacked.filter((p) => p.priceStatus === "price_missing").length,
    needsReview: active.filter((p) => p.reviewStatus === "needs_review").length,
    confirmed: planBacked.filter((p) => p.reviewStatus === "confirmed").length,
    withBbox: planBacked.length,
    withoutBbox: active.filter((p) => !positionHasBbox(p)).length,
    anchors: planBacked.reduce((s, p) => s + p.evidenceAnchors.length, 0),
    annotations: annotations.length,
  };
}
