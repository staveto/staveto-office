/** Material types aligned with mobile `ProjectMaterialDoc` / `MaterialSuggestionDoc`. */

export type MaterialUnit =
  | "pcs"
  | "m"
  | "m2"
  | "m3"
  | "kg"
  | "g"
  | "l"
  | "pack"
  | "box"
  | "roll"
  | "hour"
  | "set"
  | "pair"
  | "other";

export type MaterialCategory =
  | "cable"
  | "electrical_component"
  | "installation_box"
  | "breaker_or_protection"
  | "connector"
  | "fastener"
  | "pipe_or_conduit"
  | "board_or_panel"
  | "insulation"
  | "adhesive_or_sealant"
  | "paint_or_coating"
  | "concrete_or_mortar"
  | "wood"
  | "metal"
  | "plumbing"
  | "hvac"
  | "tool_accessory"
  | "consumable"
  | "transport"
  | "service_or_labor"
  | "discount"
  | "other_material"
  | "unknown";

export type MaterialSuggestionSource = "manual" | "ocr" | "ai" | "document";
export type MaterialSuggestionStatus = "planned" | "accepted" | "rejected";
export type MaterialConfidence = "low" | "medium" | "high";

export type MaterialSuggestionDoc = {
  id: string;
  projectId: string;
  name: string;
  category?: MaterialCategory;
  description?: string;
  suggestedQuantity?: number;
  unit?: MaterialUnit;
  estimatedUnitPrice?: number;
  estimatedTotalPrice?: number;
  currency: string;
  source: MaterialSuggestionSource;
  confidence?: MaterialConfidence;
  sourceDocumentId?: string;
  sourceExpenseId?: string;
  sourceNote?: string;
  phaseId?: string;
  taskId?: string;
  status: MaterialSuggestionStatus;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;
};

export type ProjectMaterialDoc = {
  id: string;
  projectId: string;
  organizationId?: string;
  name: string;
  category?: MaterialCategory;
  quantity: number;
  unit: MaterialUnit;
  unitPrice?: number;
  totalPrice?: number;
  currency: string;
  supplierName?: string;
  receiptUrl?: string;
  phaseId?: string;
  taskId?: string;
  usedByUserId?: string;
  usedByName?: string;
  usedAt: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  createdBy: string;
  sourceSuggestionId?: string;
};
