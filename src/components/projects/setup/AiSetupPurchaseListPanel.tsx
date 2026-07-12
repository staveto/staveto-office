"use client";

import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type { PurchaseListLine } from "@/lib/products/productSourcingTypes";

type Props = {
  lines: PurchaseListLine[];
  currency?: string;
};

/** Internal procurement list — not for the customer PDF. */
export function AiSetupPurchaseListPanel({ lines, currency = "EUR" }: Props) {
  const { t } = useI18n();
  if (lines.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-4 space-y-3">
      <div>
        <h4 className="text-sm font-bold text-[#0F2A4D]">{t("products.sourcing.purchaseList")}</h4>
        <p className="text-xs text-[#64748B] mt-1">{t("products.sourcing.purchaseListHint")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-[#64748B] uppercase tracking-wide">
            <tr>
              <th className="py-1 pr-2 font-semibold">{t("products.sourcing.col.product")}</th>
              <th className="py-1 pr-2 font-semibold">{t("products.sourcing.col.code")}</th>
              <th className="py-1 pr-2 font-semibold">{t("products.sourcing.col.qty")}</th>
              <th className="py-1 pr-2 font-semibold">{t("products.sourcing.col.net")}</th>
              <th className="py-1 font-semibold">{t("products.sourcing.col.source")}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.takeoffItemId} className="border-t border-[#E2E8F0] text-[#334155]">
                <td className="py-2 pr-2">
                  <div className="font-semibold text-[#0F2A4D]">
                    {[l.brand, l.productName].filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-[#94A3B8]">{l.requiredTitle}</div>
                </td>
                <td className="py-2 pr-2 tabular-nums">{l.productCode || "—"}</td>
                <td className="py-2 pr-2 tabular-nums">
                  {l.quantityToBuy} {l.unit}
                </td>
                <td className="py-2 pr-2 tabular-nums">
                  {typeof l.netUnitPrice === "number"
                    ? formatMoney(l.netUnitPrice, l.currency || currency)
                    : "—"}
                  {typeof l.totalNetCost === "number" ? (
                    <div className="text-[#64748B]">{formatMoney(l.totalNetCost, l.currency || currency)}</div>
                  ) : null}
                </td>
                <td className="py-2">
                  <div>{l.supplierName || l.sourceType}</div>
                  <div className="text-[#94A3B8]">{l.priceValidAt?.slice(0, 10) || "—"}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
