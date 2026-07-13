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

// ---------------------------------------------------------------------------
// Position codes (Phase 7)
// ---------------------------------------------------------------------------

const ELECTRICAL_CODE_BY_CATEGORY: Record<string, string> = {
  socket: "ZAS",
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
      reviewStatus:
        row.qty <= 0 || row.confidence === "low"
          ? ("needs_review" as const)
          : ("confirmed" as const),
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
        label: p.positionCode,
        colorKey:
          p.reviewStatus === "needs_review" && p.category === "unknown"
            ? "warning"
            : overlayColorKeyForCategory(p.category),
        needsReview: anchor.needsReview || p.reviewStatus === "needs_review",
      });
    }
  }
  return annotations;
}

/** Selection state sync: list row click ↔ PDF annotation highlight. */
export function applyAnnotationSelection(
  annotations: PdfOverlayAnnotation[],
  selectedPositionId: string | null
): PdfOverlayAnnotation[] {
  return annotations.map((a) => ({
    ...a,
    selected: selectedPositionId != null && a.positionId === selectedPositionId,
  }));
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
  | "manual_only";

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
  quick?: PositionQuickFilter;
  search?: string;
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

export function filterEstimatorPositions(
  positions: EstimatorPosition[],
  f: PositionFilters
): EstimatorPosition[] {
  const q = f.search?.trim().toLowerCase();
  return positions.filter((p) => {
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
          if (
            !p.evidenceAnchors.some(
              (a) =>
                a.sourceType === "drawing_occurrence" ||
                a.sourceType === "visual_detection"
            )
          )
            return false;
          break;
        case "legend_only":
          if (!p.evidenceAnchors.every((a) => a.sourceType === "project_legend"))
            return false;
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
  positions: EstimatorPosition[]
): PositionsQuoteSafety {
  const reasons: string[] = [];
  const active = positions.filter(
    (p) => p.reviewStatus !== "ignored" && p.reviewStatus !== "excluded"
  );

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
    (p) => p.quantitySource === "ai_estimate" && CRITICAL_CATEGORIES.has(p.category)
  );
  if (aiCritical.length > 0) {
    reasons.push(
      `${aiCritical.length} kritických pozícií má len AI odhad množstva — treba overiť.`
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
  const annotations = buildPdfOverlayAnnotations(positions);
  return {
    total: active.length,
    priceMissing: active.filter((p) => p.priceStatus === "price_missing").length,
    needsReview: active.filter((p) => p.reviewStatus === "needs_review").length,
    confirmed: active.filter((p) => p.reviewStatus === "confirmed").length,
    withBbox: active.filter((p) => positionHasBbox(p)).length,
    withoutBbox: active.filter((p) => !positionHasBbox(p)).length,
    anchors: active.reduce((s, p) => s + p.evidenceAnchors.length, 0),
    annotations: annotations.length,
  };
}
