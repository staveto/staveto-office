/**
 * Quote preparation line items for draft zákazky (sales phase).
 * Stored under projects/{projectId}/quoteItems — same pattern as tasks/expenses.
 */

export type QuoteDraftItemCategory = "material" | "work";

export type QuoteDraftItemDoc = {
  id: string;
  projectId: string;
  category: QuoteDraftItemCategory;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  note?: string;
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
};

export const QUOTE_DRAFT_DEFAULT_UNIT = "ks";

export const QUOTE_DRAFT_UNITS = ["ks", "m", "m²", "m³", "hod", "deň", "súbor"] as const;
