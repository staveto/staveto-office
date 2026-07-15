/**
 * PDF-first marking: unclassified symbol drafts.
 *
 * The user clicks a symbol in the PDF *before* telling us what it is.
 * We create an UnclassifiedSymbolDraft (UI-only, never persisted, never a
 * quote line), ask "Čo je táto značka?" and only after classification we
 * create a real EstimatorPosition with an evidence anchor.
 *
 * Pure functions — no Firestore access here.
 */

import type {
  EstimatorEvidenceAnchor,
  EstimatorPosition,
  EstimatorPositionBBox,
  EstimatorPositionUnit,
  UnclassifiedSymbolDraft,
} from "@/types/estimatorPositions";
import { positionCategoryCode } from "./estimatorPositions";
import {
  findAssemblyTemplate,
  type NormalizedElectricalPoint,
} from "./electricalAssemblyTemplates";
import {
  expandAssembly,
  intentsFromAssembly,
  type AssemblyInstance,
} from "./mapSymbolsToAssemblies";
import type { ProductSearchIntent } from "@/lib/products/productSourcingTypes";

// ---------------------------------------------------------------------------
// Draft creation from a PDF click
// ---------------------------------------------------------------------------

export type SymbolDraftColorHint = UnclassifiedSymbolDraft["colorHint"];

/** Suggested estimator categories per detected symbol color, most likely first. */
export function possibleTypesForColorHint(colorHint: SymbolDraftColorHint): string[] {
  switch (colorHint) {
    case "green":
      return ["socket", "double_socket", "cable"];
    case "red":
      return ["switch", "lighting"];
    case "orange":
      return ["lighting", "led_strip"];
    case "dark":
    case "black":
      return ["distribution_board", "installation_box", "unknown"];
    default:
      return ["unknown"];
  }
}

export type SymbolDraftMarkMeta = {
  page: number;
  bbox: EstimatorPositionBBox;
  rawSearchBbox?: EstimatorPositionBBox;
  polygon?: Array<{ x: number; y: number }>;
  colorHint?: SymbolDraftColorHint;
  confidence?: "high" | "medium" | "low";
  outsidePlan?: boolean;
};

/**
 * Build a draft from a successful symbol pick.
 * Returns null for outside-plan clicks — those must not create positions.
 */
export function buildSymbolDraftFromMark(
  meta: SymbolDraftMarkMeta
): UnclassifiedSymbolDraft | null {
  if (meta.outsidePlan) return null;
  const colorHint = meta.colorHint ?? "unknown";
  return {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    page: meta.page,
    bbox: meta.bbox,
    rawSearchBbox: meta.rawSearchBbox,
    center: {
      x: meta.bbox.x + meta.bbox.width / 2,
      y: meta.bbox.y + meta.bbox.height / 2,
    },
    polygon: meta.polygon,
    colorHint,
    possibleTypes: possibleTypesForColorHint(colorHint),
    confidence: meta.confidence ?? "low",
    status: "draft",
  };
}

// ---------------------------------------------------------------------------
// Classification → EstimatorPosition
// ---------------------------------------------------------------------------

export type SymbolDraftCategory =
  | "socket"
  | "double_socket"
  | "switch"
  | "lighting"
  | "led_strip"
  | "cable"
  | "installation_box"
  | "distribution_board"
  | "unknown";

export type SymbolDraftScope =
  | "buy_install"
  | "install_only"
  | "prepare_outlet"
  | "chase_cable"
  | "customer_supplied"
  | "out_of_scope";

export type SymbolDraftClassification = {
  category: SymbolDraftCategory;
  label?: string;
  roomName?: string;
  unit?: EstimatorPositionUnit;
  scope?: SymbolDraftScope;
};

type CategoryConfig = {
  positionCategory: string;
  normalizedPoint: NormalizedElectricalPoint;
  defaultLabel: string;
  defaultUnit: EstimatorPositionUnit;
};

const DRAFT_CATEGORY_CONFIG: Record<SymbolDraftCategory, CategoryConfig> = {
  socket: {
    positionCategory: "socket",
    normalizedPoint: "socket_point",
    defaultLabel: "Zásuvka 230V",
    defaultUnit: "ks",
  },
  double_socket: {
    positionCategory: "socket",
    normalizedPoint: "double_socket_point",
    defaultLabel: "Dvojzásuvka 230V",
    defaultUnit: "ks",
  },
  switch: {
    positionCategory: "switch",
    normalizedPoint: "switch_point",
    defaultLabel: "Vypínač",
    defaultUnit: "ks",
  },
  lighting: {
    positionCategory: "lighting",
    normalizedPoint: "light_output",
    defaultLabel: "Svetelný vývod",
    defaultUnit: "ks",
  },
  led_strip: {
    positionCategory: "led_strip",
    normalizedPoint: "led_strip_point",
    defaultLabel: "LED pás",
    defaultUnit: "m",
  },
  cable: {
    positionCategory: "cable",
    normalizedPoint: "cable_route",
    defaultLabel: "Kábel / trasa",
    defaultUnit: "m",
  },
  installation_box: {
    positionCategory: "installation_material",
    normalizedPoint: "installation_box",
    defaultLabel: "Inštalačná krabica",
    defaultUnit: "ks",
  },
  distribution_board: {
    positionCategory: "distribution_board",
    normalizedPoint: "distribution_board",
    defaultLabel: "Rozvádzač",
    defaultUnit: "ks",
  },
  unknown: {
    positionCategory: "unknown",
    normalizedPoint: "unknown",
    defaultLabel: "Neznáma značka",
    defaultUnit: "ks",
  },
};

const SCOPE_NOTE_SK: Partial<Record<SymbolDraftScope, string>> = {
  install_only: "Len montáž — materiál nedodávame.",
  prepare_outlet: "Pripraviť vývod.",
  chase_cable: "Drážka / kábel.",
  customer_supplied: "Materiál dodáva zákazník.",
  out_of_scope: "Mimo ponuky.",
};

/** Next free sequence for a code prefix, e.g. E-ZAS → E-ZAS-004. */
export function nextPositionCode(
  prefix: string,
  existing: Pick<EstimatorPosition, "positionCode">[]
): string {
  let max = 0;
  for (const p of existing) {
    if (!p.positionCode.startsWith(`${prefix}-`)) continue;
    const n = Number(p.positionCode.slice(prefix.length + 1));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export type CreatePositionFromDraftOptions = {
  fileName?: string;
  documentId?: string;
  fileId?: string;
};

export type CreatePositionFromDraftResult = {
  position: EstimatorPosition;
  assembly: AssemblyInstance | null;
  productSearchIntents: ProductSearchIntent[];
};

/**
 * Turn a classified draft into a real, user-confirmed EstimatorPosition:
 * quantity 1, evidence anchor at the clicked symbol, price still missing
 * unless the customer supplies the material or the work is out of scope.
 */
export function createPositionFromSymbolDraft(
  draft: UnclassifiedSymbolDraft,
  classification: SymbolDraftClassification,
  existingPositions: EstimatorPosition[],
  options: CreatePositionFromDraftOptions = {}
): CreatePositionFromDraftResult {
  const config = DRAFT_CATEGORY_CONFIG[classification.category];
  const scope = classification.scope ?? "buy_install";
  const label = classification.label?.trim() || config.defaultLabel;
  const codePrefix = positionCategoryCode("electrical", config.positionCategory);
  const positionCode = nextPositionCode(codePrefix, existingPositions);

  const anchor: EstimatorEvidenceAnchor = {
    // "mark_" prefix keeps this anchor counted as a manual plan mark.
    id: `mark_${draft.id}`,
    fileName: options.fileName ?? "podklad.pdf",
    documentId: options.documentId,
    fileId: options.fileId,
    page: draft.page,
    sourceType: "user_confirmed",
    sourceText: `Používateľ označil značku v pláne (${label})`,
    bbox: draft.bbox,
    rawSelectionBbox: draft.rawSearchBbox,
    tightSymbolBbox: draft.bbox,
    polygon: draft.polygon,
    markStatus: "confirmed",
    confidence: "high",
    needsReview: false,
  };

  const outOfScope = scope === "out_of_scope";
  const position: EstimatorPosition = {
    id: `pos_${positionCode}_${draft.id}`,
    positionCode,
    trade: "electrical",
    category: config.positionCategory,
    normalizedPoint: config.normalizedPoint,
    label,
    roomName: classification.roomName?.trim() || undefined,
    quantity: 1,
    unit: classification.unit ?? config.defaultUnit,
    quantitySource: "manual",
    sourceDocuments: options.documentId ? [options.documentId] : undefined,
    evidenceAnchors: [anchor],
    priceStatus: scope === "customer_supplied" ? "customer_supplied" : "price_missing",
    reviewStatus: outOfScope ? "excluded" : "confirmed",
    reviewReason: outOfScope ? SCOPE_NOTE_SK.out_of_scope : undefined,
    note: SCOPE_NOTE_SK[scope],
  };

  // Best-effort assembly + product intents (skipped for unknown symbols).
  let assembly: AssemblyInstance | null = null;
  let productSearchIntents: ProductSearchIntent[] = [];
  const template = findAssemblyTemplate(config.normalizedPoint);
  if (template && !outOfScope) {
    assembly = expandAssembly(
      {
        candidateId: draft.id,
        matchedText: label,
        displayName: label,
        normalizedPoint: config.normalizedPoint,
        sourceType: "user_confirmed",
        confidence: "high",
        needsReview: false,
        roomName: position.roomName,
        quantity: 1,
        unit: position.unit,
        page: draft.page,
      },
      template,
      {}
    );
    if (scope !== "customer_supplied") {
      productSearchIntents = intentsFromAssembly(assembly);
    }
    position.assemblyTemplateId = template.id;
    if (productSearchIntents.length > 0) {
      position.productSearchIntentIds = productSearchIntents.map((i) => i.takeoffItemId);
    }
  }

  return { position, assembly, productSearchIntents };
}
