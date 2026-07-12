/**
 * AI Estimator / Angebotsagent types (client + shared shape).
 * Additive layer — does not replace ProjectDraftPayload.
 */

export type AiEvidenceInputType =
  | "pdf"
  | "image"
  | "text"
  | "email"
  | "voice"
  | "unknown";

export type AiEvidenceSource = {
  fileId?: string;
  fileName?: string;
  page?: number;
  regionLabel?: string;
  inputType: AiEvidenceInputType;
};

export type AiConfidence = "high" | "medium" | "low";

export type AiOrigin =
  | "from_document"
  | "from_photo"
  | "from_user_text"
  | "inferred"
  | "assumption"
  | "missing";

export type AiDocumentType =
  | "electrical_marking"
  | "floor_plan"
  | "material_list"
  | "quote_request"
  | "site_photo"
  | "customer_description"
  | "technical_specification"
  | "unknown";

export type AiItemCategory =
  | "lighting"
  | "socket"
  | "switch"
  | "cable"
  | "led_strip"
  | "distribution_board"
  | "installation_material"
  | "labor"
  | "travel"
  | "other";

export type AiQuantityUnit =
  | "ks"
  | "m"
  | "m2"
  | "hod"
  | "bod"
  | "set"
  | "pausal"
  | "unknown";

export type AiExtractedRoom = {
  id: string;
  name: string;
  code?: string;
  areaM2?: number;
  floor?: string;
  evidence: AiEvidenceSource[];
  confidence: AiConfidence;
  needsReview: boolean;
};

export type AiExtractedItem = {
  id: string;
  category: AiItemCategory;
  roomId?: string;
  roomName?: string;
  title: string;
  description?: string;
  quantity?: number;
  unit?: AiQuantityUnit;
  multiplier?: number;
  computedQuantity?: number;
  origin: AiOrigin;
  evidence: AiEvidenceSource[];
  confidence: AiConfidence;
  needsReview: boolean;
  reviewReason?: string;
  included?: boolean;
};

export type AiMissingQuestion = {
  id: string;
  question: string;
  reason: string;
  importance: "critical" | "important" | "nice_to_have";
  blocksFixedQuote: boolean;
  suggestedAnswer?: string;
};

export type AiRiskWarning = {
  id: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  commercialImpact?: string;
};

/** Trade covered by legend-based symbol reading. */
export type AiTrade =
  | "electrical"
  | "hvac"
  | "plumbing"
  | "flooring"
  | "roofing"
  | "general";

/** Normalized technical symbol type. `unknown` = must be reviewed by a human. */
export type AiSymbolType =
  | "pendant_light"
  | "ceiling_light"
  | "wall_light"
  | "led_strip"
  | "lighting_profile"
  | "mirror_light_output"
  | "furniture_light"
  | "socket"
  | "switch"
  | "distribution_board"
  | "cable_route"
  | "unknown";

export type AiDrawingRegionType =
  | "legend"
  | "floor_plan"
  | "room"
  | "title_block"
  | "table"
  | "unknown";

export type AiDrawingRegion = {
  id: string;
  page: number;
  label?: string;
  regionType: AiDrawingRegionType;
  confidence: AiConfidence;
};

export type AiLegendEntry = {
  id: string;
  trade: AiTrade;
  symbolLabel?: string;
  symbolDescription: string;
  normalizedType: AiSymbolType;
  unit?: AiQuantityUnit;
  defaultQuoteCategory: "material" | "labor" | "material_and_labor" | "review_only";
  evidence: AiEvidenceSource[];
  confidence: AiConfidence;
  needsReview: boolean;
};

export type AiSymbolOccurrence = {
  id: string;
  legendEntryId?: string;
  page: number;
  roomId?: string;
  roomName?: string;
  normalizedType: AiSymbolType;
  title: string;
  quantity?: number;
  unit?: AiQuantityUnit;
  visibleLabel?: string;
  origin: AiOrigin;
  evidence: AiEvidenceSource[];
  confidence: AiConfidence;
  needsReview: boolean;
  reviewReason?: string;
};

export type AiCompanyFocusType =
  | "quote_line"
  | "material_purchase"
  | "labor_planning"
  | "site_verification"
  | "customer_question"
  | "risk"
  | "execution_task";

export type AiCompanyFocusItem = {
  id: string;
  title: string;
  description: string;
  focusType: AiCompanyFocusType;
  importance: "critical" | "important" | "nice_to_have";
  relatedRoomId?: string;
  relatedSymbolIds?: string[];
  relatedItemIds?: string[];
};

export type AiEstimatorFacts = {
  sessionId: string;
  detectedDocumentTypes: AiDocumentType[];
  inputSummary: string;
  rooms: AiExtractedRoom[];
  extractedItems: AiExtractedItem[];
  inferredItems: AiExtractedItem[];
  missingQuestions: AiMissingQuestion[];
  risks: AiRiskWarning[];
  confidence: AiConfidence;
  warnings: string[];
  /** Additive legend-first symbol reading layer (electrical drawings first). */
  drawingRegions?: AiDrawingRegion[];
  legendEntries?: AiLegendEntry[];
  symbolOccurrences?: AiSymbolOccurrence[];
  unknownSymbols?: AiSymbolOccurrence[];
  companyFocus?: AiCompanyFocusItem[];
  diagnostics?: AiEstimatorDiagnostics;
};

export type AiEstimatorDiagnostics = {
  uploadedFileCount: number;
  fileNames: string[];
  mimeTypes: string[];
  fileSizes: number[];
  detectedDocumentTypes: AiDocumentType[];
  textLayerUsed: boolean;
  visionUsed: boolean;
  pageByPageUsed: boolean;
  roomCount: number;
  extractedItemCount: number;
  inferredItemCount: number;
  missingQuestionCount: number;
  riskCount: number;
  fallbackReason?: string;
};

export type AiEstimateLine = {
  id: string;
  type: "material" | "labor" | "travel" | "subcontractor" | "other";
  title: string;
  description?: string;
  quantity: number;
  unit: string;
  unitCost?: number;
  unitPrice?: number;
  marginPercent?: number;
  totalCost?: number;
  totalPrice?: number;
  origin: AiOrigin;
  confidence: AiConfidence;
  needsReview: boolean;
  evidence: AiEvidenceSource[];
  roomName?: string;
};

export type AiQuoteDraft = {
  title: string;
  customerName?: string;
  projectAddress?: string;
  countryCode?: string;
  currency: string;
  vatPercent?: number;
  language: string;
  scopeIncluded: string[];
  scopeExcluded: string[];
  assumptions: string[];
  missingBeforeFixedPrice: AiMissingQuestion[];
  lines: AiEstimateLine[];
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  validityDays?: number;
  noteToCustomer: string;
  estimatorSessionId?: string;
};

export type AiEstimatorCountryProfile = {
  countryCode: string;
  language: string;
  currency: string;
  vatPercent: number;
  numberFormat: string;
  dateFormat: string;
  defaultUnits: string[];
  legalQuoteNotes: string[];
  tradeTerminology: string;
  defaultHourlyRate?: number;
  defaultTravelRate?: number;
};

export type AiEstimatorSession = {
  id: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  facts: AiEstimatorFacts;
  estimateLines?: AiEstimateLine[];
  quoteDraft?: AiQuoteDraft;
  status: "facts" | "estimate" | "quote_draft" | "quote_created" | "project_created";
  quoteId?: string;
  projectId?: string;
};
