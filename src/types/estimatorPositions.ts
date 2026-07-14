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
  | "ocr"
  | "ai_inferred"
  | "manual"
  | "user_confirmed";

export type EstimatorPositionBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type EstimatorEvidenceAnchor = {
  id: string;
  fileId?: string;
  fileName: string;
  page: number;
  sourceType: EstimatorEvidenceSourceKind;
  sourceText?: string;
  /** Normalized page coordinates (0..1). Absent when the source has no position. */
  bbox?: EstimatorPositionBBox;
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
  | "manual"
  | "ai_estimate"
  | "unknown";

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
  /** Normalized page coordinates (0..1). */
  bbox: EstimatorPositionBBox;
  /** Freehand shape (normalized 0..1) — rendered instead of the bbox frame. */
  polygon?: Array<{ x: number; y: number }>;
  /** True for user-placed marks (deletable in the marking workflow). */
  isManualMark?: boolean;
  /** Position code shown on the PDF, e.g. E-001. */
  label: string;
  colorKey: PdfOverlayColorKey;
  selected?: boolean;
  needsReview: boolean;
};
