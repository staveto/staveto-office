/**
 * Quote preparation line items for draft zákazky (sales phase).
 * Stored under projects/{projectId}/quoteItems — same pattern as tasks/expenses.
 */

export type QuoteDraftItemCategory = "material" | "work";

/** Honest quantity provenance — legend_only is never plan-confirmed. */
export type QuoteDraftSourceOfQuantity =
  | "symbol_detection"
  | "measured_line"
  | "measured_area"
  | "legend_only"
  | "manual"
  | "estimate_rule"
  | "route_calculation"
  | "imported_dwg";

export type QuoteDraftItemDoc = {
  id: string;
  projectId: string;
  category: QuoteDraftItemCategory;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  note?: string;
  /** When false, hidden from customer-facing quote / PDF. */
  customerVisible?: boolean;
  sourceOfQuantity?: QuoteDraftSourceOfQuantity;
  evidenceCount?: number;
  /** Drawing the quantity evidence lives on — enables evidence deep links. */
  sourceDrawingId?: string;
  takeoffStatus?:
    | "draft"
    | "needs_review"
    | "confirmed"
    | "legend_only"
    | "customer_question"
    | "excluded";
  createdAt?: string;
  updatedAt?: string;
};

export type QuoteDraftItemInput = {
  category: QuoteDraftItemCategory;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  note?: string;
  customerVisible?: boolean;
  sourceOfQuantity?: QuoteDraftSourceOfQuantity;
  evidenceCount?: number;
  sourceDrawingId?: string;
  takeoffStatus?: QuoteDraftItemDoc["takeoffStatus"];
};

export const QUOTE_DRAFT_DEFAULT_UNIT = "ks";

export const QUOTE_DRAFT_UNITS = ["ks", "m", "m²", "m³", "hod", "deň", "súbor"] as const;
