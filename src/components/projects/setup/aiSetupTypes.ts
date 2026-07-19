export type AiSetupStepId = "overview" | "material" | "work" | "price" | "offer";

export const AI_SETUP_STEPS: AiSetupStepId[] = [
  "overview",
  "material",
  "work",
  "price",
  "offer",
];

export type AiSetupMaterialRow = {
  id: string;
  suggestionId?: string;
  quoteItemId?: string;
  /**
   * Live link to a PDF takeoff item (projects/{id}/takeoffItems) — the row's
   * qty/unit mirror the marks confirmed on the plan until the quote is done.
   */
  takeoffItemId?: string;
  /** Backing projects/{id}/materials doc — lets "clear AI rows" delete it. */
  projectMaterialId?: string;
  /**
   * User deliberately added this row (manual form / own catalog). Kept when
   * PDF mirror prunes AI/quote leftovers that have no takeoffItemId.
   */
  userOwned?: boolean;
  name: string;
  qty: number;
  unit: string;
  price: number;
  included: boolean;
  /** Default true — when false, line is hidden on customer PDF. */
  customerVisible?: boolean;
  sourceNote?: string;
  confidence?: "low" | "medium" | "high";
  /** Display group for estimator clarity (socket / switch / lighting / …). */
  group?: string;
};

export type AiSetupWorkEstimate = {
  workers: number;
  hours: number;
  hourlyRate: number;
  note: string;
  quoteItemId?: string;
};

export type AiSetupCalculation = {
  marginPercent: number;
  vatPercent: number;
  otherCosts: number;
  materialTotalOverride: number | null;
  workTotalOverride: number | null;
  manualGrossTotal: number | null;
};

export type AiProjectFactsPersisted = {
  buildingType?: string;
  totalKnownAreaM2?: number;
  rooms?: { name: string; areaM2?: number }[];
  dimensions?: { label: string; value: string }[];
};

export type AiSetupPersistedMeta = {
  workEstimate?: AiSetupWorkEstimate;
  calculation?: AiSetupCalculation;
  projectFacts?: AiProjectFactsPersisted;
  /**
   * Set when the user explicitly deleted AI-suggested material rows.
   * The auto-sync must respect it and never regenerate rows from the
   * estimator session/attachments again — "vymazal som a je to preč".
   */
  aiRowsClearedAt?: string;
};

export type AiSetupTotals = {
  materialCost: number;
  workCost: number;
  otherCosts: number;
  subtotal: number;
  marginAmount: number;
  netTotal: number;
  vatAmount: number;
  grossTotal: number;
  manualTotalActive: boolean;
};
