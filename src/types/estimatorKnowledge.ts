/**
 * Estimator Knowledge Backend — structured know-how models (additive).
 *
 * Firestore layout:
 *   knowledgePacks/{packId}
 *   symbolLibrary/{symbolId}
 *   assemblyTemplates/{templateId}
 *   laborRules/{ruleId}
 *   supplierCatalogs/{supplierId}/products/{productId}
 *   organizations/{orgId}/estimatorSettings/default
 *   organizations/{orgId}/customSymbolMappings/{mappingId}
 *   organizations/{orgId}/pricebooks/{pricebookId}
 *   estimatorSessions/{sessionId}
 *
 * No protected STN/IEC symbol graphics — metadata, aliases and normalized
 * concepts only. Licensed packs plug in later via KnowledgePack.type.
 */

import type {
  AssemblyLaborComponent,
  AssemblyMaterialComponent,
  AssemblyQuoteGroup,
  NormalizedElectricalPoint,
} from "@/lib/ai/electricalAssemblyTemplates";
import type { SymbolSourceType } from "@/lib/ai/electricalSymbolLibrary";
import type {
  MaterialProductSelection,
  ProductCandidate,
} from "@/lib/products/productSourcingTypes";
import type {
  EstimatorDocument,
  EstimatorEvidenceAnchor,
  EstimatorPosition,
  EstimatorQuantityConflict,
  PdfOverlayAnnotation,
} from "@/types/estimatorPositions";

export type KnowledgeTrade = "electrical" | "plumbing" | "hvac" | "general";

export type KnowledgePackType =
  | "starter_aliases"
  | "standard_reference_metadata"
  | "licensed_standard_pack"
  | "company_custom";

export type KnowledgeLicenseStatus =
  | "internal_sample"
  | "metadata_only"
  | "licensed"
  | "company_defined";

export type KnowledgePack = {
  id: string;
  trade: KnowledgeTrade;
  countryCodes: string[];
  type: KnowledgePackType;
  sourceName: string;
  /** e.g. "IEC 60617", "STN 33 2000" — reference only, no glyphs. */
  sourceRef?: string;
  licenseStatus: KnowledgeLicenseStatus;
  version: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** Firestore document shape for symbolLibrary/{symbolId}. */
export type KnowledgeSymbolEntry = {
  id: string;
  packId: string;
  trade: KnowledgeTrade;
  countryCodes: string[];
  sourceType: SymbolSourceType;
  standardRef?: string;
  displayName: string;
  aliases: string[];
  textPatterns: string[];
  normalizedPoint: NormalizedElectricalPoint;
  defaultUnit: "ks" | "m" | "bod" | "set" | "unknown";
  quoteGroup: AssemblyQuoteGroup;
  confidenceWeight: number;
  licenseStatus: KnowledgeLicenseStatus;
  active: boolean;
};

/** Firestore document shape for assemblyTemplates/{templateId}. */
export type KnowledgeAssemblyTemplate = {
  id: string;
  trade: KnowledgeTrade;
  countryCodes: string[];
  normalizedPoint: NormalizedElectricalPoint;
  title: string;
  quoteGroup: AssemblyQuoteGroup;
  defaultUnit: "ks" | "m" | "bod" | "set";
  materialComponents: AssemblyMaterialComponent[];
  laborComponents: AssemblyLaborComponent[];
  requiredQuestions: string[];
  assumptions: string[];
  riskFlags: string[];
  active: boolean;
};

export type LaborRuleCategory =
  | "socket"
  | "switch"
  | "light_output"
  | "led_strip"
  | "cable_route"
  | "installation_box"
  | "distribution_board"
  | "testing_revision"
  | "general";

export type LaborRule = {
  id: string;
  trade: KnowledgeTrade;
  countryCodes: string[];
  category: LaborRuleCategory;
  /** e.g. "qty * minutes / 60" — same mini-language as assembly formulas. */
  formula: string;
  defaultMinutesPerUnit: number;
  /** Multipliers, e.g. { brick_wall: 1.3, concrete: 1.6, plasterboard: 0.8 } */
  difficultyFactors: Record<string, number>;
  active: boolean;
};

export type CompanyEstimatorSettings = {
  preferredBrands: string[];
  preferredSuppliers: string[];
  defaultMaterialMarginPercent: number;
  /** EUR/hod (or org currency) */
  defaultLaborRate: number;
  defaultRiskReservePercent: number;
  allowIndicativePrices: boolean;
  priceTier: "economy" | "standard" | "premium";
  updatedAt?: string;
  updatedBy?: string;
};

export type CustomSymbolMapping = {
  id: string;
  orgId: string;
  trade: KnowledgeTrade;
  countryCode: string;
  /** Text seen on the drawing / near the symbol that this mapping matches. */
  detectedText: string;
  normalizedPoint: NormalizedElectricalPoint;
  assemblyTemplateId?: string;
  createdBy: string;
  createdAt?: string;
  source: "user_confirmed";
};

export type EstimatorSessionStatus =
  | "draft"
  | "facts"
  | "review"
  | "quoted"
  | "converted"
  | "archived";

/** Top-level estimatorSessions/{sessionId} — structured session outputs. */
export type EstimatorSessionRecord = {
  id: string;
  orgId: string;
  projectId?: string;
  files: Array<{ fileName: string; storagePath?: string; pageCount?: number }>;
  /** Raw structured facts from drawing interpretation (sanitized before write). */
  drawingInterpretation?: unknown;
  symbolMatches?: Array<{
    detectedText: string;
    normalizedPoint: NormalizedElectricalPoint;
    sourceType: SymbolSourceType | "unknown";
    confidence: "high" | "medium" | "low";
    needsReview: boolean;
  }>;
  internalTakeoff?: unknown;
  assemblyItems?: unknown;
  /** Multi-document session metadata (additive; single-PDF sessions may omit). */
  documents?: EstimatorDocument[];
  /** Flat evidence index for cross-document lookup (optional). */
  evidenceAnchors?: EstimatorEvidenceAnchor[];
  /** Drawing vs schedule quantity mismatches awaiting user resolution. */
  conflicts?: EstimatorQuantityConflict[];
  /** Evidence-linked takeoff positions (interactive PDF review). */
  positions?: EstimatorPosition[];
  pdfOverlayAnnotations?: PdfOverlayAnnotation[];
  productSelections?: MaterialProductSelection[];
  quotePackage?: unknown;
  qualityGate?: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  status: EstimatorSessionStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type SupplierCatalogProduct = ProductCandidate & {
  supplierId: string;
  active?: boolean;
};

/** Query context for knowledge lookups. */
export type KnowledgeContext = {
  countryCode: string;
  trade: KnowledgeTrade;
  documentType?: string;
  orgId?: string;
};
