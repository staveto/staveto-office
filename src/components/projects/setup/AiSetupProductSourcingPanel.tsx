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
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-bold text-[#0F2A4D]">{t("products.sourcing.title")}</h4>
        <p className="text-xs text-[#64748B] mt-1 leading-relaxed">{t("products.sourcing.lead")}</p>
      </div>

      {preferencesHint ? (
        <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 text-sm text-[#334155]">
          {t("products.sourcing.preferencesHint")}
        </div>
      ) : null}

      {grouped.map(([category, rows]) => (
        <section key={category} className="rounded-2xl border-2 border-[#CBD5E1] bg-white p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#1D376A]">
            {t(`products.sourcing.cat.${category}`)}
            <span className="ml-2 text-[#94A3B8] normal-case tracking-normal font-semibold">
              ({rows.length})
            </span>
          </p>
          <ul className="space-y-3">
            {rows.map((s) => {
              const tiers = pickTierAlternatives(s);
              const open = expandedId === s.takeoffItemId;
              return (
                <li key={s.takeoffItemId} className="rounded-xl border border-[#E2E8F0] p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F2A4D]">{s.requiredTitle}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {s.requiredQuantity > 0
                          ? `${s.requiredQuantity} ${s.requiredUnit}`
                          : t("projects.aiSetup.material.qtyMissing")}
                        {s.selectedProduct
                          ? ` · ${s.selectedProduct.brand ?? ""} ${s.selectedProduct.productName}`.trim()
                          : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full",
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
                  </div>

                  {s.selectedProduct && typeof s.selectedProduct.netUnitPrice === "number" ? (
                    <div className="text-xs text-[#475569] flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        {t("products.sourcing.net")}:{" "}
                        {formatMoney(s.selectedProduct.netUnitPrice, currency)} /{" "}
                        {s.selectedProduct.unit}
                      </span>
                      {typeof s.totalMaterialSellPrice === "number" ? (
                        <span>
                          {t("products.sourcing.sell")}:{" "}
                          {formatMoney(s.totalMaterialSellPrice, currency)}
                        </span>
                      ) : null}
                      <span>
                        {t("products.sourcing.source")}: {s.selectedProduct.sourceType}
                        {s.selectedProduct.priceValidAt
                          ? ` · ${s.selectedProduct.priceValidAt.slice(0, 10)}`
                          : ""}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-amber-800">
                      {t("projects.aiSetup.material.priceMissingShort")}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => setExpandedId(open ? null : s.takeoffItemId)}
                    >
                      {open
                        ? t("products.sourcing.hideAlts")
                        : t("products.sourcing.showAlts")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => onMarkCustomerSupplied(s.takeoffItemId)}
                    >
                      {t("products.sourcing.customerSupplied")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-[#64748B]"
                      onClick={() => onExclude(s.takeoffItemId)}
                    >
                      {t("products.sourcing.exclude")}
                    </Button>
                  </div>

                  {open ? (
                    <div className="space-y-2 border-t border-[#E2E8F0] pt-2">
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
                              className="text-left rounded-lg border border-[#CBD5E1] px-3 py-2 hover:border-[#E95F2A]"
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
  );
}
