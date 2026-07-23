"use client";

/**
 * Look up a realistic unit price (catalog first, then Gemini + Google Search).
 * User must confirm before the price is written to the quote.
 */

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type { ProductPriceLookupResult } from "@/lib/ai/productPriceLookup";
import {
  lookupProductPrice,
  lookupProductPriceOnWeb,
} from "@/services/ai/productPriceLookupService";

type Props = {
  open: boolean;
  productName: string;
  onOpenChange: (open: boolean) => void;
  onApply: (payload: {
    productName: string;
    unitPrice: number;
    note?: string;
    source: ProductPriceLookupResult["source"];
  }) => Promise<void> | void;
};

export function AiPriceLookupDialog({
  open,
  productName,
  onOpenChange,
  onApply,
}: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProductPriceLookupResult | null>(null);
  const [priceText, setPriceText] = useState("");

  useEffect(() => {
    if (!open || !productName.trim()) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    setPriceText("");
    void lookupProductPrice({ productName: productName.trim(), countryCode: "SK" })
      .then((r) => {
        if (cancelled) return;
        setResult(r);
        if (r.unitPrice != null && r.unitPrice > 0) {
          setPriceText(String(r.unitPrice));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        setError(
          msg === "GEMINI_NOT_CONFIGURED" || msg.includes("GEMINI_API_KEY")
            ? t("takeoff.priceLookup.geminiMissing")
            : msg || t("takeoff.priceLookup.error")
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productName, t]);

  const runWebSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await lookupProductPriceOnWeb({
        productName: productName.trim(),
        countryCode: "SK",
      });
      setResult(r);
      if (r.unitPrice != null && r.unitPrice > 0) {
        setPriceText(String(r.unitPrice));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg === "GEMINI_NOT_CONFIGURED" || msg.includes("GEMINI_API_KEY")
          ? t("takeoff.priceLookup.geminiMissing")
          : msg || t("takeoff.priceLookup.error")
      );
    } finally {
      setLoading(false);
    }
  };

  const parsedPrice = Number.parseFloat(priceText.replace(",", "."));
  const canApply = Number.isFinite(parsedPrice) && parsedPrice > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-[#e06737]" />
            {t("takeoff.priceLookup.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("takeoff.priceLookup.hint")}
          </p>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm font-medium">
            {productName}
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("takeoff.priceLookup.searching")}
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && result ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {result.source === "electrical_catalog"
                  ? t("takeoff.priceLookup.sourceCatalog")
                  : result.source === "web_search_ai"
                    ? t("takeoff.priceLookup.sourceWeb")
                    : t("takeoff.priceLookup.sourceNone")}
              </p>
              {result.matchedName ? (
                <p className="text-sm">{result.matchedName}</p>
              ) : null}
              {result.summary ? (
                <p className="text-xs text-muted-foreground">{result.summary}</p>
              ) : null}
              {result.found && result.unitPrice != null ? (
                <p className="text-sm font-semibold tabular-nums">
                  {formatMoney(result.unitPrice, result.currency || "EUR")}
                  {result.indicative ? (
                    <span className="ml-2 text-xs font-normal text-amber-700 dark:text-amber-400">
                      {t("takeoff.priceLookup.indicative")}
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("takeoff.priceLookup.notFound")}
                </p>
              )}
              {result.sourceUrls.length > 0 ? (
                <ul className="space-y-1">
                  {result.sourceUrls.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="size-3" />
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="ai-price-input" className="text-xs text-muted-foreground">
              {t("takeoff.priceLookup.priceLabel")}
            </Label>
            <Input
              id="ai-price-input"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="0.00"
              disabled={loading || applying}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || applying}
            onClick={() => void runWebSearch()}
          >
            <Sparkles className="mr-1 size-3.5" />
            {t("takeoff.priceLookup.searchWeb")}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={applying}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!canApply || applying}
              onClick={async () => {
                if (!canApply) return;
                setApplying(true);
                try {
                  const noteParts = [
                    result?.source === "web_search_ai"
                      ? t("takeoff.priceLookup.noteAi")
                      : result?.source === "electrical_catalog"
                        ? t("takeoff.priceLookup.noteCatalog")
                        : null,
                    result?.supplierName,
                    result?.summary,
                  ].filter(Boolean);
                  await onApply({
                    productName,
                    unitPrice: parsedPrice,
                    note: noteParts.length ? noteParts.join(" · ") : undefined,
                    source: result?.source ?? "not_found",
                  });
                  onOpenChange(false);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : t("takeoff.priceLookup.applyError")
                  );
                } finally {
                  setApplying(false);
                }
              }}
            >
              {applying ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : null}
              {t("takeoff.priceLookup.apply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
