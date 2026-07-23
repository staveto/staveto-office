"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Loader2,
  Package,
  Plus,
  Search,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import type {
  ElectricalCatalogCategory,
  ElectricalCatalogProduct,
} from "@/lib/catalog/electrical/types";
import {
  isCatalogImageFailed,
  markCatalogImageFailed,
  resolveCatalogProductImageUrl,
} from "@/lib/catalog/electrical/images";
import {
  filterProductsByCategory,
  searchElectricalProducts,
} from "@/lib/catalog/electrical/searchSuggest";
import {
  loadElectricalCatalog,
  productUnitPriceEur,
} from "@/services/catalog/electricalCatalogReadService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (product: ElectricalCatalogProduct) => void;
  onAddCustom?: () => void;
  onOpenCompanyCatalog?: () => void;
};

/** Keep the DOM small — full catalog is 1k+ rows. */
const PAGE_SIZE = 40;

function formatProductPrice(product: ElectricalCatalogProduct): string {
  const eur = productUnitPriceEur(product);
  if (eur <= 0 && product.pricing.priceStatus !== "valid") {
    return "—";
  }
  return formatMoney(eur, product.pricing.currency || "EUR");
}

function ProductThumb({
  product,
  size = "md",
}: {
  product: ElectricalCatalogProduct;
  size?: "sm" | "md";
}) {
  const url = useMemo(
    () => resolveCatalogProductImageUrl(product),
    [product.imageUrl, product.supplierSku]
  );
  const [failed, setFailed] = useState(() =>
    url ? isCatalogImageFailed(url) : true
  );

  useEffect(() => {
    setFailed(url ? isCatalogImageFailed(url) : true);
  }, [url]);

  const box =
    size === "sm" ? "size-10 rounded-md" : "size-14 rounded-lg sm:size-16";

  if (!url || failed) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center border border-border bg-muted/50 text-muted-foreground",
          box
        )}
        aria-hidden
      >
        <Package className={size === "sm" ? "size-4" : "size-5"} />
      </div>
    );
  }
  return (
    // External BUCO CDN — plain img so we do not need next/image remote config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        markCatalogImageFailed(url);
        setFailed(true);
      }}
      className={cn(
        "shrink-0 border border-border bg-white object-contain dark:bg-card",
        box
      )}
    />
  );
}

export function ElectricalCatalogPickerDialog({
  open,
  onOpenChange,
  onPick,
  onAddCustom,
  onOpenCompanyCatalog,
}: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ElectricalCatalogCategory[]>([]);
  const [products, setProducts] = useState<ElectricalCatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [topCategoryId, setTopCategoryId] = useState<string | null>(null);
  const [childCategoryId, setChildCategoryId] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [wasOpen, setWasOpen] = useState(open);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setTopCategoryId(null);
      setChildCategoryId(null);
      setSuggestOpen(false);
      setAddedCount(0);
      setJustAddedId(null);
      setError(null);
      setVisibleLimit(PAGE_SIZE);
      // Keep previous catalog in memory — avoid full Firestore re-fetch flash.
      if (products.length === 0) setLoading(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (products.length === 0) setLoading(true);
    void loadElectricalCatalog()
      .then(({ categories: cats, products: prods }) => {
        if (cancelled) return;
        setCategories(cats);
        setProducts(prods);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : t("projects.draft.quoteItem.catalogLoadError")
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // products.length intentionally omitted — only gate initial loading UI
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, t]);

  useEffect(() => {
    if (!justAddedId) return;
    const timer = window.setTimeout(() => setJustAddedId(null), 900);
    return () => window.clearTimeout(timer);
  }, [justAddedId]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /** Live product counts per category id (more accurate than import snapshot). */
  const countsByCategoryId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      for (const id of p.categoryPathIds) {
        map.set(id, (map.get(id) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const topCategories = useMemo(() => {
    return categories
      .filter((c) => c.level === 0)
      .filter((c) => (countsByCategoryId.get(c.id) ?? 0) > 0)
      .sort((a, b) => {
        // Push "Ostatné" to the end
        if (a.slug === "ostatne-elektro") return 1;
        if (b.slug === "ostatne-elektro") return -1;
        return a.sortOrder - b.sortOrder;
      });
  }, [categories, countsByCategoryId]);

  const childCategories = useMemo(() => {
    if (!topCategoryId) return [];
    return categories
      .filter((c) => c.parentId === topCategoryId)
      .filter((c) => (countsByCategoryId.get(c.id) ?? 0) > 0);
  }, [categories, topCategoryId, countsByCategoryId]);

  const activeCategoryId = childCategoryId ?? topCategoryId;

  const activeTop = topCategories.find((c) => c.id === topCategoryId) ?? null;
  const activeChild =
    childCategories.find((c) => c.id === childCategoryId) ?? null;

  const suggestions = useMemo(() => {
    if (search.trim().length < 1) return [];
    return searchElectricalProducts(products, search, {
      categoryId: activeCategoryId,
      limit: 8,
    });
  }, [products, search, activeCategoryId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim();
    if (q.length >= 1) {
      return searchElectricalProducts(products, q, {
        categoryId: activeCategoryId,
        limit: 300,
      }).map((h) => h.product);
    }
    return filterProductsByCategory(products, activeCategoryId);
  }, [products, search, activeCategoryId]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );
  const hasMore = visibleLimit < filteredProducts.length;

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [search, activeCategoryId]);

  const handlePick = (product: ElectricalCatalogProduct) => {
    onPick(product);
    setAddedCount((c) => c + 1);
    setJustAddedId(product.id);
    setSuggestOpen(false);
  };

  const selectTop = (id: string | null) => {
    setTopCategoryId(id);
    setChildCategoryId(null);
  };

  const heading =
    activeChild?.name ??
    activeTop?.name ??
    t("projects.draft.quoteItem.catalogAllCategories");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,56rem)] max-h-[92vh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(72rem,calc(100%-1.5rem))]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4 text-[#e06737]" />
            {t("projects.draft.quoteItem.electricalCatalogTitle")}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-xs text-muted-foreground">
              {t("projects.draft.quoteItem.catalogRulesHint")}
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            {/* Left: categories */}
            <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/30 sm:flex">
              <p className="px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("projects.draft.quoteItem.catalogCategoriesLabel")}
              </p>
              <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
                <button
                  type="button"
                  onClick={() => selectTop(null)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    !topCategoryId
                      ? "bg-[#1D376A] font-medium text-white"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  <span>{t("projects.draft.quoteItem.catalogAllCategories")}</span>
                  <span className="text-xs opacity-70">{products.length}</span>
                </button>
                {topCategories.map((cat) => {
                  const count = countsByCategoryId.get(cat.id) ?? 0;
                  const selected = topCategoryId === cat.id;
                  return (
                    <div key={cat.id}>
                      <button
                        type="button"
                        onClick={() => selectTop(cat.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                          selected && !childCategoryId
                            ? "bg-[#1D376A] font-medium text-white"
                            : selected
                              ? "bg-[#1D376A]/15 font-medium text-foreground"
                              : "text-foreground hover:bg-muted"
                        )}
                      >
                        <span className="pr-2 leading-snug">{cat.name}</span>
                        <span className="shrink-0 text-xs opacity-70">{count}</span>
                      </button>
                      {selected && childCategories.length > 0 ? (
                        <div className="mb-1 ml-2 mt-0.5 space-y-0.5 border-l border-border pl-2">
                          <button
                            type="button"
                            onClick={() => setChildCategoryId(null)}
                            className={cn(
                              "flex w-full rounded-md px-2 py-1.5 text-left text-xs",
                              !childCategoryId
                                ? "font-medium text-[#e06737]"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {t("projects.draft.quoteItem.catalogAllInCategory")}
                          </button>
                          {childCategories.map((child) => (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => setChildCategoryId(child.id)}
                              className={cn(
                                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
                                childCategoryId === child.id
                                  ? "bg-[#e06737]/15 font-medium text-[#e06737]"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span className="pr-1 leading-snug">{child.name}</span>
                              <span className="opacity-70">
                                {countsByCategoryId.get(child.id) ?? 0}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </nav>
            </aside>

            {/* Right: search + list */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="shrink-0 space-y-3 border-b border-border px-4 py-3 sm:px-5">
                <div ref={searchWrapRef} className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSuggestOpen(true);
                    }}
                    onFocus={() => setSuggestOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setSuggestOpen(false);
                      if (e.key === "Enter" && suggestions[0]) {
                        e.preventDefault();
                        handlePick(suggestions[0].product);
                      }
                    }}
                    placeholder={t("projects.draft.quoteItem.catalogSearchPlaceholder")}
                    className="h-11 pl-9"
                    autoFocus
                    aria-autocomplete="list"
                    aria-expanded={suggestOpen && suggestions.length > 0}
                  />
                  {suggestOpen && search.trim().length >= 1 && suggestions.length > 0 ? (
                    <ul
                      className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
                      role="listbox"
                    >
                      {suggestions.map(({ product }) => (
                        <li key={product.id} role="option" aria-selected={false}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted"
                            onClick={() => handlePick(product)}
                          >
                            <ProductThumb product={product} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {product.name}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {[product.brand, product.supplierSku]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-medium tabular-nums">
                              {formatProductPrice(product)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                {/* Mobile category select */}
                <div className="flex gap-2 sm:hidden">
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
                    value={topCategoryId ?? ""}
                    onChange={(e) => selectTop(e.target.value || null)}
                    aria-label={t("projects.draft.quoteItem.catalogCategoriesLabel")}
                  >
                    <option value="">
                      {t("projects.draft.quoteItem.catalogAllCategories")}
                    </option>
                    {topCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({countsByCategoryId.get(cat.id) ?? 0})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {filteredProducts.length > PAGE_SIZE
                      ? t("projects.draft.quoteItem.catalogShowingCount", {
                          shown: String(visibleProducts.length),
                          total: String(filteredProducts.length),
                        })
                      : t("projects.draft.quoteItem.catalogResultCount", {
                          count: String(filteredProducts.length),
                        })}
                  </p>
                </div>
              </div>

              {filteredProducts.length === 0 ? (
                <p className="px-5 py-16 text-center text-sm text-muted-foreground">
                  {t("projects.draft.quoteItem.catalogNoMatches")}
                </p>
              ) : (
                <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                  {visibleProducts.map((product) => {
                    const justAdded = justAddedId === product.id;
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => handlePick(product)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:gap-4 sm:px-5 sm:py-3.5",
                            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D376A]/40",
                            justAdded && "bg-emerald-50 dark:bg-emerald-950/30"
                          )}
                        >
                          <ProductThumb product={product} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-muted-foreground">
                              {product.categoryPathNames.join(" › ")}
                            </p>
                            <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">
                              {product.name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[product.brand, product.series, product.supplierSku]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <p className="text-sm font-semibold tabular-nums text-foreground">
                              {formatProductPrice(product)}
                              <span className="font-normal text-muted-foreground"> / ks</span>
                            </p>
                            <span
                              className={cn(
                                "inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-white",
                                justAdded ? "bg-emerald-600" : "bg-[#e06737]"
                              )}
                            >
                              {justAdded ? (
                                <>
                                  <Check className="size-3.5" />
                                  {t("materials.catalog.pickerAddedShort")}
                                </>
                              ) : (
                                <>
                                  <Plus className="size-3.5" />
                                  {t("materials.catalog.pickerAdd")}
                                </>
                              )}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  {hasMore ? (
                    <li className="px-4 py-3 sm:px-5">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          setVisibleLimit((n) => n + PAGE_SIZE)
                        }
                      >
                        {t("projects.draft.quoteItem.catalogLoadMore")}
                      </Button>
                    </li>
                  ) : null}
                </ul>
              )}

              {addedCount > 0 ? (
                <p className="shrink-0 border-t border-border px-5 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {t("materials.catalog.pickerAddedCount", { count: String(addedCount) })}
                </p>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="-mx-0 mb-0 rounded-none border-t border-border bg-muted/40 px-4 py-3 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {onAddCustom ? (
              <Button type="button" variant="ghost" size="sm" onClick={onAddCustom}>
                <Plus className="mr-1 size-3.5" />
                {t("projects.draft.quoteItem.addCustom")}
              </Button>
            ) : null}
            {onOpenCompanyCatalog ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenCompanyCatalog}
              >
                <BookOpen className="mr-1 size-3.5" />
                {t("projects.draft.quoteItem.openCatalog")}
              </Button>
            ) : null}
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {addedCount > 0 ? t("common.close") : t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
