/**
 * Estimate calculation utilities (shared server/client)
 */

export function computeItemTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice * 100) / 100;
}

export function computeEstimateTotals(
  items: { total: number }[],
  vatPercent: number
): { subtotal: number; vatAmount: number; grandTotal: number } {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const roundedSubtotal = Math.round(subtotal * 100) / 100;
  const vatAmount = Math.round(roundedSubtotal * (vatPercent / 100) * 100) / 100;
  const grandTotal = Math.round((roundedSubtotal + vatAmount) * 100) / 100;

  return {
    subtotal: roundedSubtotal,
    vatAmount,
    grandTotal,
  };
}
