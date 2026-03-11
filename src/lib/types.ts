/**
 * Type-safe models for Staveto Office
 */

export type EstimateStatus = "draft" | "sent" | "approved" | "rejected";

export interface EstimateItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface Estimate {
  id: string;
  title: string;
  clientName: string;
  clientEmail?: string;
  status: EstimateStatus;
  items: EstimateItem[];
  subtotal: number;
  vatPercent: number;
  vatAmount: number;
  grandTotal: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface CreateEstimateInput {
  title: string;
  clientName: string;
  clientEmail?: string;
  status?: EstimateStatus;
  items: Omit<EstimateItem, "id" | "total">[];
  vatPercent?: number;
  notes?: string;
}

export interface UpdateEstimateInput {
  title?: string;
  clientName?: string;
  clientEmail?: string;
  status?: EstimateStatus;
  items?: Omit<EstimateItem, "id" | "total">[];
  vatPercent?: number;
  notes?: string;
}
