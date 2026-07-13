"use client";

/**
 * Price drawer for a takeoff position with a missing price.
 *
 * Price source priority: company pricebook → supplier catalog → imported
 * pricebook → manual price → AI estimate (indicative only). 0 € is never
 * applied silently; "customer supplied" is an explicit state.
 */

import { useCallback, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type {
  ProductCandidate,
  ProductCategory,
  ProductSearchIntent,
} from "@/lib/products/productSourcingTypes";
import { searchProductCandidates } from "@/services/products/productSourcingService";
import type { EstimatorPosition } from "@/types/estimatorPositions";

export type CatalogPriceChoice = {
  unitPrice: number;
  sourceType: "company_pricebook" | "supplier_catalog" | "imported_csv_pricebook";
  productName?: string;
  supplierId?: string;
  currency?: string;
};

type Props = {
  position: EstimatorPosition | null;
  currency?: string;
  onClose: () => void;
  onApplyManualPrice: (position: EstimatorPosition, unitPrice: number, applySimilar: boolean) => void;
  onApplyCatalogPrice: (
    position: EstimatorPosition,
    price: CatalogPriceChoice,
    applySimilar: boolean
  ) => void;
  onMarkCustomerSupplied: (position: EstimatorPosition) => void;
};

const CATEGORY_TO_PRODUCT_CATEGORY: Record<string, ProductCategory> = {
  socket: "socket",
  switch: "switch",
  lighting: "light_fixture",
  led_strip: "led_strip",
  cable: "cable",
  distribution_board: "distribution_board",
  installation_material: "mounting_material",
};

function candidateSourceType(
  candidate: ProductCandidate
): CatalogPriceChoice["sourceType"] {
  switch (candidate.sourceType) {
    case "company_catalog":
      return "company_pricebook";
    case "uploaded_pricebook":
      return "imported_csv_pricebook";
    default:
      return "supplier_catalog";
  }
}

export function EstimatorPriceDrawer({
  position,
  currency = "EUR",
  onClose,
  onApplyManualPrice,
  onApplyCatalogPrice,
  onMarkCustomerSupplied,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState<ProductCandidate[]>([]);
  const [manualPrice, setManualPrice] = useState("");
  const [applySimilar, setApplySimilar] = useState(true);
  const [zeroWarning, setZeroWarning] = useState(false);

  const runSearch = useCallback(async () => {
    if (!position) return;
    setSearching(true);
    setSearched(true);
    try {
      const intent: ProductSearchIntent = {
        takeoffItemId: position.id,
        title: query.trim() || position.label,
        category: CATEGORY_TO_PRODUCT_CATEGORY[position.category] ?? "other",
        quantity: position.quantity || 1,
        unit: position.unit,
        keywords: (query.trim() || position.label).split(/\s+/).filter(Boolean),
        needsReviewReasons: [],
      };
      const results = await searchProductCandidates(intent);
      setCandidates(results.filter((c) => (c.netUnitPrice ?? 0) > 0).slice(0, 8));
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  }, [position, query]);

  const applyManual = () => {
    if (!position) return;
    const value = Number(manualPrice.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setZeroWarning(true);
      return;
    }
    setZeroWarning(false);
    onApplyManualPrice(position, value, applySimilar);
    onClose();
  };

  const applyCandidate = (candidate: ProductCandidate) => {
    if (!position) return;
    const unitPrice = candidate.netUnitPrice ?? 0;
    if (unitPrice <= 0) {
      setZeroWarning(true);
      return;
    }
    onApplyCatalogPrice(
      position,
      {
        unitPrice,
        sourceType: candidateSourceType(candidate),
        productName: candidate.productName,
        supplierId: candidate.supplierName,
        currency: candidate.currency || currency,
      },
      applySimilar
    );
    onClose();
  };

  return (
    <Dialog
      open={position != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0F2A4D] font-bold">
            {t("projects.aiSetup.positions.priceDrawer.title")}
            {position ? (
              <span className="ml-2 font-mono text-xs text-[#64748B]">
                {position.positionCode}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {position?.label}
            {position?.roomName ? ` · ${position.roomName}` : ""}
            {position && position.quantity > 0
              ? ` · ${position.quantity} ${position.unit !== "unknown" ? position.unit : ""}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-[#64748B] leading-relaxed">
          {t("projects.aiSetup.positions.priceDrawer.priorityHint")}
        </p>

        {/* Catalog search */}
        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[#1D376A]">
            {t("projects.aiSetup.positions.priceDrawer.searchCatalog")}
          </h4>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runSearch();
                }
              }}
              placeholder={t("projects.aiSetup.positions.priceDrawer.searchPlaceholder")}
              className="h-9 text-sm"
              aria-label={t("projects.aiSetup.positions.priceDrawer.searchCatalog")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-[#CBD5E1] shrink-0"
              onClick={() => void runSearch()}
              disabled={searching}
            >
              <Search className="size-4 mr-1" />
              {searching
                ? t("projects.aiSetup.positions.priceDrawer.searching")
                : t("projects.aiSetup.positions.priceDrawer.searchCta")}
            </Button>
          </div>
          {searched && !searching ? (
            candidates.length === 0 ? (
              <p className="text-xs text-[#64748B]">
                {t("projects.aiSetup.positions.priceDrawer.noResults")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#0F2A4D]">
                        <PackageSearch className="mr-1 inline size-3.5 text-[#94A3B8]" />
                        {c.productName}
                      </p>
                      <p className="text-[11px] text-[#64748B]">
                        {[c.brand, c.supplierName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-sm font-semibold text-[#0F2A4D]">
                        {formatMoney(c.netUnitPrice ?? 0, c.currency || currency)}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 bg-[#1D376A] px-2 text-xs hover:bg-[#16294f]"
                        onClick={() => applyCandidate(c)}
                      >
                        {t("projects.aiSetup.positions.priceDrawer.usePrice")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>

        {/* Manual price */}
        <section className="space-y-2 border-t border-[#E2E8F0] pt-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[#1D376A]">
            {t("projects.aiSetup.positions.priceDrawer.manualTitle")}
          </h4>
          <div className="flex items-end gap-2">
            <label className="flex-1 space-y-1">
              <span className="text-xs font-semibold text-[#64748B]">
                {t("projects.aiSetup.positions.priceDrawer.manualLabel")} ({currency})
              </span>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                className="h-9 tabular-nums"
                placeholder="0.00"
              />
            </label>
            <Button
              type="button"
              className="h-9 bg-[#E95F2A] px-3 text-sm font-semibold hover:bg-[#D94F1F]"
              onClick={applyManual}
            >
              {t("projects.aiSetup.positions.priceDrawer.manualApply")}
            </Button>
          </div>
          {zeroWarning ? (
            <p className="text-xs font-semibold text-amber-700" role="alert">
              {t("projects.aiSetup.positions.priceDrawer.zeroGuard")}
            </p>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-[#334155]">
            <input
              type="checkbox"
              checked={applySimilar}
              onChange={(e) => setApplySimilar(e.target.checked)}
              className="size-4 accent-[#E95F2A]"
            />
            {t("projects.aiSetup.positions.priceDrawer.applySimilar")}
          </label>
        </section>

        {/* Customer supplied */}
        <section className="border-t border-[#E2E8F0] pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-[#CBD5E1] text-[#475569]"
            onClick={() => {
              if (!position) return;
              onMarkCustomerSupplied(position);
              onClose();
            }}
          >
            {t("projects.aiSetup.positions.priceDrawer.customerSupplied")}
          </Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}
