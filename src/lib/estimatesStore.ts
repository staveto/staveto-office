/**
 * MVP in-memory store for estimates.
 * For production, replace with database (e.g. PostgreSQL, Supabase).
 */

import type { Estimate, CreateEstimateInput, UpdateEstimateInput } from "./types";
import { computeEstimateTotals } from "./estimateUtils";

const estimates = new Map<string, Estimate>();

function generateId(): string {
  return `est_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getAllEstimates(): Estimate[] {
  return Array.from(estimates.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getEstimateById(id: string): Estimate | undefined {
  return estimates.get(id);
}

export function createEstimate(input: CreateEstimateInput): Estimate {
  const now = new Date().toISOString();
  const items = input.items.map((item) => ({
    ...item,
    id: generateId(),
    total: item.qty * item.unitPrice,
  }));
  const totals = computeEstimateTotals(items, input.vatPercent ?? 0);

  const estimate: Estimate = {
    id: generateId(),
    title: input.title,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    status: input.status ?? "draft",
    items,
    subtotal: totals.subtotal,
    vatPercent: input.vatPercent ?? 0,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grandTotal,
    createdAt: now,
    updatedAt: now,
    notes: input.notes,
  };

  estimates.set(estimate.id, estimate);
  return estimate;
}

export function updateEstimate(id: string, input: UpdateEstimateInput): Estimate | null {
  const existing = estimates.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const items = input.items
    ? input.items.map((item) => ({
        ...item,
        id: generateId(),
        total: item.qty * item.unitPrice,
      }))
    : existing.items;

  const totals = computeEstimateTotals(
    items,
    input.vatPercent ?? existing.vatPercent
  );

  const updated: Estimate = {
    ...existing,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.clientName !== undefined && { clientName: input.clientName }),
    ...(input.clientEmail !== undefined && { clientEmail: input.clientEmail }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.notes !== undefined && { notes: input.notes }),
    items,
    subtotal: totals.subtotal,
    vatPercent: input.vatPercent ?? existing.vatPercent,
    vatAmount: totals.vatAmount,
    grandTotal: totals.grandTotal,
    updatedAt: now,
  };

  estimates.set(id, updated);
  return updated;
}

export function deleteEstimate(id: string): boolean {
  return estimates.delete(id);
}
