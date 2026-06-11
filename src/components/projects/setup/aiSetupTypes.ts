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
  name: string;
  qty: number;
  unit: string;
  price: number;
  included: boolean;
  /** Default true — when false, line is hidden on customer PDF. */
  customerVisible?: boolean;
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

export type AiSetupPersistedMeta = {
  workEstimate: AiSetupWorkEstimate;
  calculation: AiSetupCalculation;
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
