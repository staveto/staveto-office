/**
 * PDF Takeoff Region Analyzer — data model (Phase 1+).
 *
 * Extends the Plan Takeoff Workbench without replacing DrawingOccurrence.
 * Candidates from region analysis stay unconfirmed until a later review phase;
 * they must never silently become quote quantities.
 *
 * Coordinate notes:
 * - bbox_pdf: [x1, y1, x2, y2] in PDF page space (points) when page size is known,
 *   otherwise normalized 0..1 page fractions (same order).
 * - bbox_px: [x1, y1, x2, y2] in the rendered region/page raster pixels.
 * - Overlay rendering uses normalizedPosition (0..1) derived from bbox_pdf.
 */

import type { NormalizedRect, TakeoffTrade } from "@/types/drawingTakeoff";

/** Honest quantity provenance — legend must never look like plan confirmation. */
export type SourceOfQuantity =
  | "symbol_detection"
  | "measured_line"
  | "measured_area"
  | "legend_only"
  | "manual"
  | "estimate_rule"
  | "route_calculation"
  | "imported_dwg";

export type DetectedPlanType = "vector" | "raster" | "hybrid" | "unknown";

export type DrawingRegionStatus = "pending" | "analyzed" | "failed";

export type SymbolColorLayer =
  | "green"
  | "red"
  | "orange"
  | "blue"
  | "black"
  | "gray"
  | "unknown";

export type SymbolCandidateKind =
  | "symbol_candidate"
  | "text"
  | "dimension"
  | "line"
  | "ignored";

export type SymbolCandidateSource =
  | "opencv"
  | "template_match"
  | "ocr"
  | "gemini"
  | "manual"
  | "mixed";

export type SymbolCandidateStatus =
  | "candidate"
  | "probable"
  | "confirmed"
  | "rejected"
  | "unknown_type"
  | "needs_customer_info";

export type TakeoffItemStatus =
  | "draft"
  | "needs_review"
  | "confirmed"
  | "legend_only"
  | "customer_question"
  | "excluded";

export type ConfirmationSource = "user" | "ai_auto" | "imported";

export type QuantityReliability = "low" | "medium" | "high";

export type BBoxPdf = [number, number, number, number];
export type BBoxPx = [number, number, number, number];

export type LabelSuggestion = {
  label: string;
  confidence: number;
};

export type DrawingPageMeta = {
  id: string;
  drawingId: string;
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  hasTextLayer: boolean;
  hasVectorObjects: boolean;
  hasImages: boolean;
  detectedPlanType: DetectedPlanType;
  createdAt: string;
  updatedAt: string;
};

export type DrawingRegion = {
  id: string;
  drawingId: string;
  projectId: string;
  pageNumber: number;
  /** [x1, y1, x2, y2] — see file header for PDF vs normalized convention. */
  bboxPdf: BBoxPdf;
  /** Normalized 0..1 rect for overlays (derived from bboxPdf). */
  normalizedBbox: NormalizedRect;
  profession: TakeoffTrade | string;
  status: DrawingRegionStatus;
  /** PNG crop of the analyzed region in Storage (Phase 2.5), null if unavailable. */
  regionImageUrl?: string | null;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type SymbolCandidate = {
  id: string;
  drawingId: string;
  projectId: string;
  pageNumber: number;
  regionId: string | null;
  bboxPdf: BBoxPdf;
  bboxPx: BBoxPx;
  /** Normalized 0..1 on the full page — source of truth for PDF overlays. */
  normalizedPosition: NormalizedRect;
  colorLayer: SymbolColorLayer;
  kind: SymbolCandidateKind;
  labelSuggestions: LabelSuggestion[];
  nearbyText: string | null;
  confidence: number;
  source: SymbolCandidateSource;
  status: SymbolCandidateStatus;
  previewImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConfirmedSymbol = {
  id: string;
  candidateId: string | null;
  drawingId: string;
  projectId: string;
  pageNumber: number;
  bboxPdf: BBoxPdf;
  normalizedPosition: NormalizedRect;
  symbolType: string;
  profession: TakeoffTrade | string;
  roomId: string | null;
  zoneId: string | null;
  quantityValue: number;
  quantityUnit: string;
  confirmedBy?: string;
  confirmationSource: ConfirmationSource;
  confidence: number;
  evidenceImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SymbolTemplate = {
  id: string;
  projectId: string | null;
  companyId: string | null;
  profession: TakeoffTrade | string;
  symbolType: string;
  label: string;
  colorLayer: SymbolColorLayer;
  templateImageUrl: string | null;
  maskImageUrl: string | null;
  createdFromSymbolId: string | null;
  createdBy?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TakeoffItem = {
  id: string;
  projectId: string;
  drawingId: string | null;
  quoteId: string | null;
  name: string;
  profession: TakeoffTrade | string;
  quantity: number;
  unit: string;
  sourceOfQuantity: SourceOfQuantity;
  status: TakeoffItemStatus;
  evidenceCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type TakeoffEvidence = {
  id: string;
  takeoffItemId: string;
  confirmedSymbolId: string | null;
  drawingId: string;
  projectId: string;
  pageNumber: number;
  bboxPdf: BBoxPdf;
  /** Normalized 0..1 page rect for PDF overlay zoom (Phase 2). */
  normalizedPosition?: NormalizedRect;
  evidenceImageUrl: string | null;
  createdAt: string;
};

/** A point on the PDF page in normalized 0..1 page fractions (page-space, unrotated). */
export type NormalizedPoint = {
  x: number;
  y: number;
};

/**
 * Scale calibration of one PDF page — the user marks a known real-world
 * length with two points. All measurement lengths on that page derive from
 * `metersPerPdfPoint`. One calibration per (drawingId, pageNumber).
 */
export type DrawingScaleCalibration = {
  id: string;
  projectId: string;
  drawingId: string;
  pageNumber: number;
  pointA: NormalizedPoint;
  pointB: NormalizedPoint;
  /** Page size in PDF points (page-space, i.e. before any view rotation). */
  pageWidthPt: number;
  pageHeightPt: number;
  /** Real length the user entered, in meters. */
  realLengthM: number;
  /** Distance |A−B| in PDF points at calibration time. */
  pdfDistancePt: number;
  metersPerPdfPoint: number;
  createdAt: string;
  updatedAt: string;
};

export type CableRunStatus = "draft" | "review" | "checked" | "approved";

export type CableInstallationType =
  | "groove"
  | "surface_trunking"
  | "conduit"
  | "ceiling"
  | "drywall"
  | "floor"
  | "other";

/**
 * A cable route measured as a polyline on the plan. Lengths are derived
 * from the page's scale calibration; `finalLengthM` additionally includes
 * vertical drops, reserves and rounding (see cableMeasurement.ts).
 */
export type CableRun = {
  id: string;
  projectId: string;
  drawingId: string;
  pageNumber: number;
  name: string;
  circuitName?: string;
  /** Optional link to a workspace catalog item (price source at export). */
  cableTypeId?: string;
  cableTypeName: string;
  installationType: CableInstallationType;
  /** Polyline vertices in normalized page coordinates (≥ 2 points). */
  points: NormalizedPoint[];
  /**
   * "Pen-up" jumps: indexes `i` whose segment points[i-1]→points[i] is a
   * skip (drawn dashed, NOT counted into the length). Lets one run continue
   * elsewhere on the plan while staying a single quote position.
   */
  gapIndexes?: number[];
  /** 2D route length on the plan (m), from calibration. */
  measured2dLengthM: number;
  /** Vertical drops/rises not visible on the floor plan (m). */
  verticalLengthM: number;
  /** Fixed extra reserve (m), e.g. connection slack. */
  fixedReserveM: number;
  /** Percentual reserve applied on top of route + vertical + fixed. */
  reservePercent: number;
  /** Rounding step for the purchasable length (m), e.g. 1. */
  roundingStepM: number;
  /** Final purchase length (m) — what goes into the quote. */
  finalLengthM: number;
  status: CableRunStatus;
  catalogItemId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

/** Simple two-point length measurement (informational, not quote data). */
export type DrawingMeasurement = {
  id: string;
  projectId: string;
  drawingId: string;
  pageNumber: number;
  type: "length";
  pointA: NormalizedPoint;
  pointB: NormalizedPoint;
  measuredLengthM: number;
  label?: string;
  createdAt: string;
  updatedAt: string;
};

/** Free-form drawing annotation — designer notes, NOT takeoff data. */
export type DrawingAnnotationKind = "text" | "note" | "rect" | "ellipse";

export type DrawingAnnotation = {
  id: string;
  projectId: string;
  drawingId: string;
  pageNumber: number;
  kind: DrawingAnnotationKind;
  /** Normalized 0..1 page rect (anchor point + size for text/note). */
  normalizedPosition: NormalizedRect;
  /** Text content (text/note kinds); empty for bare shapes. */
  text: string;
  /** CSS color of the annotation. */
  color: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
};

export type TakeoffRfi = {
  id: string;
  projectId: string;
  drawingId: string | null;
  quoteId: string | null;
  title: string;
  question: string;
  status: "draft" | "sent" | "answered" | "resolved" | "cancelled";
  relatedSymbolIds: string[];
  relatedTakeoffItemIds: string[];
  customerAnswer: string | null;
  priceImpactStatus: "none" | "possible" | "confirmed";
  createdAt: string;
  updatedAt: string;
};

export type PlanQuality = {
  detectedPlanType: DetectedPlanType;
  hasTextLayer: boolean;
  hasVectorObjects: boolean;
  ocrRequired: boolean;
  scaleSet?: boolean;
  legendDetected?: boolean;
  quantityReliability?: QuantityReliability;
};

export type AnalyzeRegionRequest = {
  bbox_pdf: BBoxPdf;
  profession: string;
  mode?: "find_all_candidates";
  use_gemini_for_uncertain?: boolean;
  /**
   * Optional PNG/JPEG of the region crop (no data: prefix).
   * When provided, server runs color masks without re-fetching the PDF.
   */
  imageBase64?: string;
  mimeType?: "image/png" | "image/jpeg";
  /** Full page raster size used when the crop was taken (for bbox_pdf mapping). */
  pageWidthPx?: number;
  pageHeightPx?: number;
  /** Crop origin/size in page pixels: [x, y, w, h]. */
  regionBboxPx?: BBoxPx;
  /** PDF page size in points — when set, bbox_pdf is treated as PDF points. */
  pageWidthPt?: number;
  pageHeightPt?: number;
};

export type AnalyzeRegionCandidateDto = {
  id: string;
  page_number?: number;
  bbox_pdf: BBoxPdf;
  bbox_px: BBoxPx;
  color_layer: SymbolColorLayer;
  kind: SymbolCandidateKind;
  label_suggestions: LabelSuggestion[];
  nearby_text: string | null;
  confidence: number;
  source: SymbolCandidateSource;
  status: SymbolCandidateStatus;
  preview_image_url: string | null;
  /** Convenience for the existing takeoff overlay (0..1). */
  normalized_position: NormalizedRect;
};

export type AnalyzeRegionResponse = {
  region_id: string;
  plan_quality: {
    detected_plan_type: DetectedPlanType;
    has_text_layer: boolean;
    has_vector_objects: boolean;
    ocr_required: boolean;
  };
  summary: {
    green_candidates: number;
    red_candidates: number;
    orange_candidates: number;
    ignored_text_or_dimensions: number;
    needs_review: number;
  };
  candidates: AnalyzeRegionCandidateDto[];
};

export const SOURCE_OF_QUANTITY_VALUES: SourceOfQuantity[] = [
  "symbol_detection",
  "measured_line",
  "measured_area",
  "legend_only",
  "manual",
  "estimate_rule",
  "route_calculation",
  "imported_dwg",
];

/** UI badge copy key for legend-only rows (SK in translations). */
export const LEGEND_ONLY_BADGE_KEY = "takeoff.quantity.legendOnlyBadge";
