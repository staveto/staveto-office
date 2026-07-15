/**
 * Evidence-linked takeoff model (additive, estimator-only).
 *
 * Every takeoff position must be able to answer:
 *  - Where did I come from? (evidence anchors: legend / schedule / drawing / visual / manual)
 *  - Where am I in the drawing? (page + bbox when available)
 *  - How was I counted? (quantitySource)
 *  - Who confirmed me? (reviewStatus)
 *  - What product/price is assigned? (priceStatus + unitPrice)
 *  - Am I ready for a fixed quote?
 */

export type EstimatorEvidenceSourceKind =
  | "project_legend"
  | "schedule_table"
  | "drawing_occurrence"
  | "visual_detection"
  | "technical_report"
  | "pricebook"
  | "ocr"
  | "ai_inferred"
  | "manual"
  | "user_confirmed";

export type EstimatorDocumentRole =
  | "drawing"
  | "legend"
  | "schedule"
  | "technical_report"
  | "pricebook"
  | "photo"
  | "other";

export type EstimatorDocumentStatus =
  | "uploaded"
  | "processed"
  | "needs_review"
  | "failed";

/** One uploaded file in a multi-document estimator session. */
export type EstimatorDocument = {
  id: string;
  fileId: string;
  fileName: string;
  fileUrl?: string;
  mimeType: string;
  pageCount?: number;
  role: EstimatorDocumentRole;
  trades: EstimatorPositionTrade[];
  documentTypes: string[];
  status: EstimatorDocumentStatus;
  confidence: "high" | "medium" | "low";
};

export type EstimatorPositionBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EstimatorEvidenceAnchor = {
  id: string;
  /** Links anchor to EstimatorDocument.id in multi-document sessions. */
  documentId?: string;
  fileId?: string;
  fileName: string;
  page: number;
  sourceType: EstimatorEvidenceSourceKind;
  sourceText?: string;
  /** Normalized page coordinates (0..1). Used for crop/evidence — may be tightened. */
  bbox?: EstimatorPositionBBox;
  /** User's original lasso/click selection before tightening. */
  rawSelectionBbox?: EstimatorPositionBBox;
  /** Tight bbox around detected symbol pixels (when reliable). */
  tightSymbolBbox?: EstimatorPositionBBox;
  /** Manual mark eligibility — outside_plan marks do not count toward quantity. */
  markStatus?:
    | "confirmed"
    | "outside_plan"
    | "needs_review"
    | "inside_plan"
    | "boundary_uncertain"
    | "in_legend_or_table";
  /** Freehand shape (normalized 0..1 points) for user-drawn marks. */
  polygon?: Array<{ x: number; y: number }>;
  cropId?: string;
  confidence: "high" | "medium" | "low";
  needsReview: boolean;
};

export type EstimatorPositionTrade =
  | "electrical"
  | "plumbing"
  | "hvac"
  | "painting"
  | "flooring"
  | "roofing"
  | "general_construction";

export type EstimatorPositionUnit =
  | "ks"
  | "m"
  | "m2"
  | "m3"
  | "bm"
  | "set"
  | "h"
  | "unknown";

export type EstimatorQuantitySource =
  | "legend"
  | "schedule"
  | "drawing_detection"
  | "visual_detection"
  | "technical_report"
  | "manual"
  | "ai_estimate"
  | "unknown";

export type EstimatorConflictStatus =
  | "open"
  | "resolved_drawing"
  | "resolved_schedule"
  | "resolved_manual"
  | "excluded";

/** Quantity mismatch between drawing and schedule sources for the same item. */
export type EstimatorQuantityConflict = {
  id: string;
  positionId: string;
  label: string;
  roomName?: string;
  category: string;
  drawingQty?: number;
  scheduleQty?: number;
  unit: EstimatorPositionUnit;
  status: EstimatorConflictStatus;
  note?: string;
};

export type EstimatorPriceStatus =
  | "priced"
  | "price_missing"
  | "indicative"
  | "manual_price"
  | "supplier_catalog"
  | "company_pricebook"
  | "customer_supplied";

export type EstimatorReviewStatus =
  | "needs_review"
  | "confirmed"
  | "ignored"
  | "excluded";

export type EstimatorPosition = {
  id: string;
  /** Stable code, e.g. E-ZAS-001 (sockets), E-VYP-001 (switches). */
  positionCode: string;
  trade: EstimatorPositionTrade;
  category: string;
  normalizedPoint: string;
  label: string;
  roomName?: string;
  quantity: number;
  unit: EstimatorPositionUnit;
  quantitySource: EstimatorQuantitySource;
  /** EstimatorDocument.id values that contributed evidence to this position. */
  sourceDocuments?: string[];
  evidenceAnchors: EstimatorEvidenceAnchor[];
  assemblyTemplateId?: string;
  productSearchIntentIds?: string[];
  priceStatus: EstimatorPriceStatus;
  unitPrice?: number;
  totalPrice?: number;
  currency?: string;
  /** Product/supplier metadata when price comes from a catalog/pricebook. */
  productRef?: {
    productName?: string;
    supplierId?: string;
    sourceType: "company_pricebook" | "supplier_catalog" | "imported_csv_pricebook";
  };
  /** Linked editable material row in the setup flow (pricing source of truth). */
  linkedMaterialRowId?: string;
  reviewStatus: EstimatorReviewStatus;
  reviewReason?: string;
  note?: string;
};

export type PdfOverlayColorKey =
  | "socket"
  | "switch"
  | "lighting"
  | "led"
  | "cabling"
  | "unknown"
  | "warning";

export type PdfOverlayAnnotation = {
  id: string;
  evidenceAnchorId: string;
  positionId?: string;
  page: number;
  /** Normalized page coordinates (0..1) — evidence/crop bbox. */
  bbox: EstimatorPositionBBox;
  rawSelectionBbox?: EstimatorPositionBBox;
  tightSymbolBbox?: EstimatorPositionBBox;
  markStatus?:
    | "confirmed"
    | "outside_plan"
    | "needs_review"
    | "inside_plan"
    | "boundary_uncertain"
    | "in_legend_or_table";
  /** Freehand shape (normalized 0..1) — stored for evidence, not drawn by default. */
  polygon?: Array<{ x: number; y: number }>;
  /** True for user-placed marks (deletable in the marking workflow). */
  isManualMark?: boolean;
  /** Position code shown on the PDF, e.g. E-001. */
  label: string;
  colorKey: PdfOverlayColorKey;
  selected?: boolean;
  needsReview: boolean;
};

/** User-facing pin/marker derived from evidence bbox center (not the full crop rect). */
export type PdfDisplayMarker = {
  id: string;
  positionId: string;
  evidenceAnchorId?: string;
  page: number;
  center: { x: number; y: number };
  radius?: number;
  /** Normalized box drawn around the symbol (tight when available). */
  displayBbox?: EstimatorPositionBBox;
  /** Normalized outline of symbol ink — preferred over displayBbox when present. */
  polygon?: Array<{ x: number; y: number }>;
  label: string;
  colorKey: PdfOverlayColorKey;
  needsReview: boolean;
  selected: boolean;
  isManualMark?: boolean;
  markStatus?:
    | "confirmed"
    | "outside_plan"
    | "needs_review"
    | "inside_plan"
    | "boundary_uncertain"
    | "in_legend_or_table";
  /** Debug-only technical boxes (normalized 0..1). */
  rawSelectionBbox?: EstimatorPositionBBox;
  tightSymbolBbox?: EstimatorPositionBBox;
};

/**
 * PDF-first marking: a symbol the user clicked before telling us what it is.
 * Drafts are UI-only — they never create quote lines until classified.
 */
export type UnclassifiedSymbolDraft = {
  id: string;
  page: number;
  /** Tight symbol bbox in normalized page coords (0..1). */
  bbox: EstimatorPositionBBox;
  rawSearchBbox?: EstimatorPositionBBox;
  center: { x: number; y: number };
  /** Outline of symbol ink (normalized). */
  polygon?: Array<{ x: number; y: number }>;
  colorHint: "red" | "orange" | "green" | "dark" | "black" | "unknown";
  /** Suggested categories ordered by likelihood (from colorHint). */
  possibleTypes: string[];
  confidence: "high" | "medium" | "low";
  status: "draft" | "classified" | "ignored";
};
