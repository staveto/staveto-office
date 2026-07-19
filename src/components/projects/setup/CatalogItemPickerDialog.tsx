"use client";

/**
 * "Pridať z katalógu" — pick items from the company's own price list
 * (workspaces/{wsKey}/catalogItems) and insert them into the quote's
 * material rows. Items are copied (name/unit/price); the quote row keeps
 * no link back to the catalog.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Hammer, Package, Plus, Search } from "lucide-react";
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

  const load = useCallback(async () => {
    if (!workspaceKey) return;
    try {
      setItems(await listCatalogItems(workspaceKey));
    } catch {
      setItems([]);
    }
  }, [workspaceKey]);

  useEffect(() => {
    if (open) {
      setAddedCount(0);
      setSearch("");
      void load();
    }
  }, [open, load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-[#1D376A]" />
            {t("materials.catalog.pickerTitle")}
          </DialogTitle>
        </DialogHeader>

        {items === null ? (
          <div className="space-y-2 py-2" role="status" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 py-4 text-center">
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
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("materials.catalog.searchPlaceholder")}
                className="pl-8"
                autoFocus
              />
            </div>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {visible.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("materials.catalog.noMatches")}
                </li>
              ) : (
                visible.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2"
                    data-testid="catalog-picker-row"
                  >
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center justify-center rounded-full p-1.5",
                        item.kind === "work"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800"
                      )}
                      title={
                        item.kind === "work"
                          ? t("materials.catalog.kindWork")
                          : t("materials.catalog.kindProduct")
                      }
                    >
                      {item.kind === "work" ? (
                        <Hammer className="size-3.5" />
                      ) : (
                        <Package className="size-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.name}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatPrice(item.unitPrice, item.currency)} / {unitLabel(t, item.unit)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={() => {
                        onPick(item);
                        setAddedCount((c) => c + 1);
                      }}
                      data-testid="catalog-picker-add"
                    >
                      <Plus className="mr-1 size-3.5" />
                      {t("materials.catalog.pickerAdd")}
                    </Button>
                  </li>
                ))
              )}
            </ul>
            {addedCount > 0 ? (
              <p className="text-xs font-medium text-emerald-700" role="status">
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
