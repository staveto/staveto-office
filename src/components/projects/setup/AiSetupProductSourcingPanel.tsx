"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import { isProductSourcingEnabled } from "@/lib/products/productSourcingFeature";
import type { MaterialProductSelection, ProductCandidate } from "@/lib/products/productSourcingTypes";
import { pickTierAlternatives } from "@/services/products/productSourcingService";
import { cn } from "@/lib/utils";

type Props = {
  selections: MaterialProductSelection[];
  currency?: string;
  onSelectProduct: (takeoffItemId: string, product: ProductCandidate) => void;
  onManualPrice: (takeoffItemId: string, netUnitPrice: number) => void;
  onMarkCustomerSupplied: (takeoffItemId: string) => void;
  onExclude: (takeoffItemId: string) => void;
  preferencesHint?: boolean;
};

function statusLabel(status: MaterialProductSelection["priceStatus"], t: (k: string) => string): string {
  switch (status) {
    case "confirmed":
      return t("products.sourcing.badge.confirmed");
    case "indicative":
      return t("products.sourcing.badge.indicative");
    case "needs_review":
      return t("products.sourcing.badge.needsReview");
    default:
      return t("products.sourcing.badge.missing");
  }
}

const GRID =
  "grid grid-cols-[minmax(180px,1.4fr)_72px_minmax(110px,0.9fr)_88px_88px_minmax(160px,auto)] items-center gap-x-3";

export function AiSetupProductSourcingPanel({
  selections,
  currency = "EUR",
  onSelectProduct,
  onManualPrice,
  onMarkCustomerSupplied,
  onExclude,
  preferencesHint,
}: Props) {
  const { t } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, MaterialProductSelection[]>();
    for (const s of selections) {
      const key = s.selectedProduct?.category ?? "other";
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [selections]);

  if (!isProductSourcingEnabled()) return null;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-bold text-[#0F2A4D]">{t("products.sourcing.title")}</h4>
        <p className="text-xs text-[#64748B] mt-1 leading-relaxed">{t("products.sourcing.lead")}</p>
      </div>

      {preferencesHint ? (
        <div className="rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 text-sm text-[#334155]">
          {t("products.sourcing.preferencesHint")}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border-2 border-[#CBD5E1] bg-white">
        <div
          className={cn(
            GRID,
            "border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] min-w-[720px]"
          )}
        >
          <span>{t("products.sourcing.col.product")}</span>
          <span>{t("products.sourcing.col.qty")}</span>
          <span>{t("products.sourcing.col.status")}</span>
          <span className="text-right">{t("products.sourcing.col.net")}</span>
          <span className="text-right">{t("products.sourcing.col.sell")}</span>
          <span className="text-right">{t("products.sourcing.col.actions")}</span>
        </div>

        {grouped.map(([category, rows]) => (
          <section key={category} className="min-w-[720px]">
            <p className="bg-[#EEF2FF] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#1D376A] border-b border-[#E2E8F0]">
              {t(`products.sourcing.cat.${category}`)}
              <span className="ml-2 text-[#94A3B8] normal-case tracking-normal font-semibold">
                ({rows.length})
              </span>
            </p>
            <ul>
              {rows.map((s, rowIndex) => {
                const tiers = pickTierAlternatives(s);
                const open = expandedId === s.takeoffItemId;
                const productLabel = s.selectedProduct
                  ? `${s.selectedProduct.brand ?? ""} ${s.selectedProduct.productName}`.trim()
                  : "";
                const net =
                  s.selectedProduct && typeof s.selectedProduct.netUnitPrice === "number"
                    ? s.selectedProduct.netUnitPrice
                    : null;
                const sell =
                  typeof s.totalMaterialSellPrice === "number" ? s.totalMaterialSellPrice : null;

                return (
                  <li key={s.takeoffItemId}>
                    <div
                      className={cn(
                        GRID,
                        "px-3 py-2 border-b border-[#F1F5F9]",
                        rowIndex % 2 === 1 && "bg-[#FAFBFC]"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0F2A4D] leading-snug break-words">
                          {s.requiredTitle}
                        </p>
                        {productLabel ? (
                          <p className="text-xs text-[#64748B] mt-0.5 break-words">{productLabel}</p>
                        ) : null}
                      </div>
                      <span className="text-sm tabular-nums text-[#334155]">
                        {s.requiredQuantity > 0
                          ? `${s.requiredQuantity} ${s.requiredUnit}`
                          : "—"}
                      </span>
                      <span
                        className={cn(
                          "justify-self-start text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded",
                          s.priceStatus === "confirmed" && "bg-emerald-50 text-emerald-800",
                          s.priceStatus === "indicative" && "bg-amber-50 text-amber-800",
                          (s.priceStatus === "missing" || s.priceStatus === "needs_review") &&
                            "bg-red-50 text-red-800",
                          s.customerSupplied && "bg-slate-100 text-slate-700"
                        )}
                      >
                        {s.customerSupplied
                          ? t("products.sourcing.badge.customerSupplied")
                          : statusLabel(s.priceStatus, t)}
                      </span>
                      <span className="text-sm tabular-nums text-right text-[#334155]">
                        {net != null ? formatMoney(net, currency) : "—"}
                      </span>
                      <span className="text-sm tabular-nums text-right font-medium text-[#0F2A4D]">
                        {sell != null ? formatMoney(sell, currency) : "—"}
                      </span>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setExpandedId(open ? null : s.takeoffItemId)}
                        >
                          {open
                            ? t("products.sourcing.hideAlts")
                            : t("products.sourcing.showAlts")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-[#64748B]"
                          onClick={() => onMarkCustomerSupplied(s.takeoffItemId)}
                        >
                          {t("products.sourcing.customerSupplied")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] text-[#94A3B8]"
                          onClick={() => onExclude(s.takeoffItemId)}
                        >
                          {t("products.sourcing.exclude")}
                        </Button>
                      </div>
                    </div>

                    {open ? (
                      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-3 py-3 space-y-2">
                        <p className="text-[11px] font-bold uppercase text-[#64748B]">
                          {t("products.sourcing.tiers")}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {(
                            [
                              ["economy", tiers.economy],
                              ["standard", tiers.standard],
                              ["premium", tiers.premium],
                            ] as const
                          ).map(([tier, product]) =>
                            product ? (
                              <button
                                key={tier}
                                type="button"
                                className="text-left rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 hover:border-[#E95F2A]"
                                onClick={() => onSelectProduct(s.takeoffItemId, product)}
                              >
                                <p className="text-[11px] font-bold uppercase text-[#64748B]">
                                  {t(`products.sourcing.tier.${tier}`)}
                                </p>
                                <p className="text-xs font-semibold text-[#0F2A4D] mt-0.5">
                                  {product.brand} · {product.productName}
                                </p>
                                <p className="text-xs tabular-nums text-[#475569]">
                                  {typeof product.netUnitPrice === "number"
                                    ? formatMoney(product.netUnitPrice, currency)
                                    : "—"}
                                </p>
                              </button>
                            ) : null
                          )}
                        </div>
                        <div className="flex flex-wrap items-end gap-2 pt-1">
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold text-[#64748B]">
                              {t("products.sourcing.manualPrice")}
                            </span>
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              className="h-9 w-28"
                              value={manualDraft[s.takeoffItemId] ?? ""}
                              onChange={(e) =>
                                setManualDraft((prev) => ({
                                  ...prev,
                                  [s.takeoffItemId]: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 bg-[#1D376A] hover:bg-[#162c56]"
                            onClick={() => {
                              const n = Number(manualDraft[s.takeoffItemId]);
                              if (Number.isFinite(n) && n > 0) onManualPrice(s.takeoffItemId, n);
                            }}
                          >
                            {t("products.sourcing.applyManual")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
