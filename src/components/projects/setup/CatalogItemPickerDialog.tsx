"use client";

/**
 * Firemný katalóg — pick items from the company's own price list
 * (workspaces/{wsKey}/catalogItems) and copy them into quote draft lines.
 * Items are copied (name/unit/price); the quote row keeps no live link
 * back to the catalog, so quote edits never mutate catalogItems.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  Hammer,
  Maximize2,
  Minimize2,
  Package,
  Plus,
  Search,
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
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import { listCatalogItems, type CatalogItemDoc } from "@/services/materials";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Insert one catalog item into the quote. Called per click. */
  onPick: (item: CatalogItemDoc) => void;
};

function unitLabel(t: (k: string) => string, unit: string): string {
  const key = `materials.unit.${unit}`;
  const v = t(key);
  return v === key ? unit : v;
}

function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("sk-SK", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function CatalogItemPickerDialog({ open, onOpenChange, onPick }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const workspaceKey =
    activeWorkspace && user ? getWorkspaceStorageKey(activeWorkspace, user.id) : null;

  const [items, setItems] = useState<CatalogItemDoc[] | null>(null);
  const [search, setSearch] = useState("");
  /** How many rows were inserted in this dialog session (feedback). */
  const [addedCount, setAddedCount] = useState(0);
  /** Brief highlight on the tile that was just added. */
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset picker session when the dialog opens (adjust state during render).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAddedCount(0);
      setJustAddedId(null);
      setSearch("");
      setItems(null);
    }
  }

  useEffect(() => {
    if (!open || !workspaceKey) return;
    let cancelled = false;
    // Async catalog fetch for the open dialog session.
    void (async () => {
      try {
        const list = await listCatalogItems(workspaceKey);
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workspaceKey]);

  useEffect(() => {
    if (!justAddedId) return;
    const timer = window.setTimeout(() => setJustAddedId(null), 900);
    return () => window.clearTimeout(timer);
  }, [justAddedId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const handlePick = (item: CatalogItemDoc) => {
    onPick(item);
    setAddedCount((c) => c + 1);
    setJustAddedId(item.id);
  };

  const gridClass = expanded
    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-4 transition-[max-width,height,max-height] duration-200",
          expanded
            ? "h-[min(92vh,56rem)] max-h-[92vh] w-[calc(100%-1.5rem)] sm:max-w-[min(96rem,calc(100%-1.5rem))]"
            : "max-h-[90vh] sm:max-w-4xl"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-10 z-10"
          onClick={() => setExpanded((v) => !v)}
          aria-pressed={expanded}
          aria-label={
            expanded
              ? t("materials.catalog.pickerShrink")
              : t("materials.catalog.pickerExpand")
          }
          title={
            expanded
              ? t("materials.catalog.pickerShrink")
              : t("materials.catalog.pickerExpand")
          }
        >
          {expanded ? (
            <Minimize2 className="size-4" aria-hidden />
          ) : (
            <Maximize2 className="size-4" aria-hidden />
          )}
        </Button>

        <DialogHeader className="pr-16">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-[#1D376A]" />
            {t("materials.catalog.pickerTitle")}
          </DialogTitle>
        </DialogHeader>

        {items === null ? (
          <div
            className={cn("grid flex-1 gap-3", gridClass)}
            role="status"
            aria-live="polite"
          >
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("materials.catalog.pickerEmpty")}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/materials/catalog" target="_blank">
                <BookOpen className="mr-1.5 size-3.5" />
                {t("materials.catalog.pickerOpenCatalog")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("materials.catalog.searchPlaceholder")}
                className="h-11 pl-8"
                autoFocus
              />
            </div>

            {visible.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {t("materials.catalog.noMatches")}
              </p>
            ) : (
              <ul
                className={cn(
                  "grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-1",
                  gridClass,
                  expanded ? "max-h-none" : "max-h-[min(28rem,55vh)]"
                )}
                role="list"
              >
                {visible.map((item) => {
                  const isWork = item.kind === "work";
                  const justAdded = justAddedId === item.id;
                  return (
                    <li key={item.id} data-testid="catalog-picker-row">
                      <button
                        type="button"
                        onClick={() => handlePick(item)}
                        className={cn(
                          "flex h-full min-h-[8.5rem] w-full flex-col rounded-xl border p-4 text-left transition-colors",
                          "hover:border-[#1D376A]/40 hover:bg-[#1D376A]/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D376A]/40",
                          justAdded
                            ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                            : "border-border bg-card"
                        )}
                        aria-label={`${t("materials.catalog.pickerAdd")}: ${item.name}`}
                        data-testid="catalog-picker-add"
                      >
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span
                            className={cn(
                              "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                              isWork
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                            )}
                            title={
                              isWork
                                ? t("materials.catalog.kindWork")
                                : t("materials.catalog.kindProduct")
                            }
                          >
                            {isWork ? (
                              <Hammer className="size-4" aria-hidden />
                            ) : (
                              <Package className="size-4" aria-hidden />
                            )}
                          </span>
                          <span
                            className={cn(
                              "inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium",
                              justAdded
                                ? "bg-emerald-600 text-white"
                                : "bg-[#e06737] text-white"
                            )}
                          >
                            {justAdded ? (
                              <>
                                <Check className="size-3.5" aria-hidden />
                                {t("materials.catalog.pickerAddedShort")}
                              </>
                            ) : (
                              <>
                                <Plus className="size-3.5" aria-hidden />
                                {t("materials.catalog.pickerAdd")}
                              </>
                            )}
                          </span>
                        </div>

                        <p className="line-clamp-3 text-sm font-semibold leading-snug text-foreground">
                          {item.name}
                        </p>
                        {item.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}

                        <p className="mt-auto pt-3 text-sm font-semibold tabular-nums text-[#1D376A] dark:text-blue-200">
                          {formatPrice(item.unitPrice, item.currency)}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            / {unitLabel(t, item.unit)}
                          </span>
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {addedCount > 0 ? (
              <p className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400" role="status">
                {t("materials.catalog.pickerAddedCount", { count: String(addedCount) })}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {addedCount > 0 ? t("common.close") : t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
