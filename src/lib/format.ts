/**
 * Money and number formatting utilities
 */

export function formatMoney(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("sk-SK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
