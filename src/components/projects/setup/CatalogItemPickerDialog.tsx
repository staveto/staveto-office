"use client";

/**
 * Firemný katalóg — pick items from the company's own price list
 * (workspaces/{wsKey}/catalogItems) and copy them into quote draft lines.
 * Items are copied (name/unit/price); the quote row keeps no live link
 * back to the catalog, so quote edits never mutate catalogItems.
 *
 * Operators can also create a new catalog item here (same fields as
 * /app/materials/catalog) so they don't leave the quote / takeoff flow.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import { MATERIAL_UNITS } from "@/lib/materialCatalog";
import {
  createCatalogItem,
  listCatalogItems,
  type CatalogItemDoc,
  type CatalogItemKind,
  type MaterialUnit,
} from "@/services/materials";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Insert one catalog item into the quote. Called per click. */
  onPick: (item: CatalogItemDoc) => void;
  /** Optional: leave catalog and insert a blank custom quote line. */
  onAddCustom?: () => void;
  /** When set, only show products or only works (vlastné položky výkonu). */
  kindFilter?: CatalogItemKind;
  /** Optional dialog title override (defaults by kindFilter / company catalog). */
  title?: string;
};

type CreateForm = {
  kind: CatalogItemKind;
  name: string;
  description: string;
  unit: MaterialUnit;
  price: string;
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

function emptyCreateForm(kind: CatalogItemKind): CreateForm {
  return {
    kind,
    name: "",
    description: "",
    unit: kind === "work" ? "hour" : "pcs",
    price: "",
  };
}

export function CatalogItemPickerDialog({
  open,
  onOpenChange,
  onPick,
  onAddCustom,
  kindFilter,
  title,
}: Props) {
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
  const [createForm, setCreateForm] = useState<CreateForm | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /** Match catalog page default (Produkt); respect work/product filter when set. */
  const defaultKind: CatalogItemKind = kindFilter ?? "product";

  // Reset picker session when the dialog opens (adjust state during render).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAddedCount(0);
      setJustAddedId(null);
      setSearch("");
      setItems(null);
      setCreateForm(null);
      setCreateError(null);
      setSavingCreate(false);
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

  const scoped = useMemo(() => {
    const list = items ?? [];
    return kindFilter ? list.filter((i) => i.kind === kindFilter) : list;
  }, [items, kindFilter]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(
      (i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        (i.description ?? "").toLowerCase().includes(q)
    );
  }, [scoped, search]);

  const dialogTitle =
    title ??
    (kindFilter === "work"
      ? t("materials.catalog.pickerTitleWork")
      : kindFilter === "product"
        ? t("materials.catalog.pickerTitleProduct")
        : t("materials.catalog.pickerTitle"));

  const emptyMessage =
    kindFilter === "work"
      ? t("materials.catalog.pickerEmptyWork")
      : kindFilter === "product"
        ? t("materials.catalog.pickerEmptyProduct")
        : t("materials.catalog.pickerEmpty");

  const expandCatalogLabel =
    kindFilter === "product"
      ? t("materials.catalog.addProduct")
      : kindFilter === "work"
        ? t("materials.catalog.addWork")
        : t("materials.catalog.newTitle");

  const priceNumber = createForm ? Number(createForm.price) : 0;
  const createValid =
    !!createForm &&
    createForm.name.trim().length > 0 &&
    Number.isFinite(priceNumber) &&
    priceNumber >= 0;

  const openCreateForm = () => {
    setCreateError(null);
    setCreateForm(emptyCreateForm(defaultKind));
  };

  const handlePick = (item: CatalogItemDoc) => {
    onPick(item);
    setAddedCount((c) => c + 1);
    setJustAddedId(item.id);
  };

  const handleCreateSave = async () => {
    if (!createForm || !createValid || !workspaceKey || !user || savingCreate) return;
    setSavingCreate(true);
    setCreateError(null);
    try {
      const created = await createCatalogItem(workspaceKey, user.id, {
        kind: createForm.kind,
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        unit: createForm.unit,
        unitPrice: priceNumber,
      });
      setItems((prev) =>
        [...(prev ?? []), created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setCreateForm(null);
      handlePick(created);
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : t("materials.catalog.saveError")
      );
    } finally {
      setSavingCreate(false);
    }
  };

  const gridClass = expanded
    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-4 transition-[max-width,height,max-height] duration-200",
          createForm
            ? "sm:max-w-md"
            : expanded
              ? "h-[min(92vh,56rem)] max-h-[92vh] w-[calc(100%-1.5rem)] sm:max-w-[min(96rem,calc(100%-1.5rem))]"
              : "max-h-[90vh] sm:max-w-4xl"
        )}
      >
        {!createForm ? (
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
        ) : null}

        <DialogHeader className={createForm ? undefined : "pr-16"}>
          <DialogTitle className="flex items-center gap-2">
            {createForm ? (
              t("materials.catalog.newTitle")
            ) : kindFilter === "work" ? (
              <>
                <Hammer className="size-4 text-[#1D376A]" />
                {dialogTitle}
              </>
            ) : (
              <>
                <BookOpen className="size-4 text-[#1D376A]" />
                {dialogTitle}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {createForm ? (
          /* Same fields as /app/materials/catalog → Nová položka */
          <div className="space-y-3">
            <div className="flex gap-2">
              {(
                [
                  {
                    kind: "product" as const,
                    labelKey: "materials.catalog.kindProduct",
                    icon: Package,
                  },
                  {
                    kind: "work" as const,
                    labelKey: "materials.catalog.kindWork",
                    icon: Hammer,
                  },
                ] as const
              ).map(({ kind, labelKey, icon: Icon }) => (
                <button
                  key={kind}
                  type="button"
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    createForm.kind === kind
                      ? "border-[#1D376A] bg-[#1D376A]/10 text-[#1D376A]"
                      : "border-border text-muted-foreground hover:border-[#1D376A]/40"
                  )}
                  onClick={() =>
                    setCreateForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            kind,
                            // Works default to hourly; keep an explicit user choice.
                            unit:
                              prev.unit === (kind === "work" ? "pcs" : "hour")
                                ? kind === "work"
                                  ? "hour"
                                  : "pcs"
                                : prev.unit,
                          }
                        : prev
                    )
                  }
                  aria-pressed={createForm.kind === kind}
                >
                  <Icon className="size-4" />
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("materials.catalog.fieldName")}
              </span>
              <Input
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) =>
                    prev ? { ...prev, name: e.target.value } : prev
                  )
                }
                placeholder={
                  createForm.kind === "work"
                    ? t("materials.catalog.namePlaceholderWork")
                    : t("materials.catalog.namePlaceholderProduct")
                }
                autoFocus
                data-testid="catalog-picker-create-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createValid) {
                    e.preventDefault();
                    void handleCreateSave();
                  }
                }}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("materials.catalog.colUnit")}
                </span>
                <Select
                  value={createForm.unit}
                  onValueChange={(v) =>
                    setCreateForm((prev) =>
                      prev ? { ...prev, unit: v as MaterialUnit } : prev
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {unitLabel(t, u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("materials.catalog.fieldPrice")}
                </span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={createForm.price}
                  onChange={(e) =>
                    setCreateForm((prev) =>
                      prev ? { ...prev, price: e.target.value } : prev
                    )
                  }
                  placeholder="0.00"
                  data-testid="catalog-picker-create-price"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("materials.catalog.fieldDescription")}
              </span>
              <Input
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((prev) =>
                    prev ? { ...prev, description: e.target.value } : prev
                  )
                }
                placeholder={t("materials.catalog.descriptionPlaceholder")}
              />
            </label>
            {createError ? (
              <p className="text-sm text-destructive" role="alert">
                {createError}
              </p>
            ) : null}
          </div>
        ) : items === null ? (
          <div
            className={cn("grid flex-1 gap-3", gridClass)}
            role="status"
            aria-live="polite"
          >
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : scoped.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={openCreateForm}
                data-testid="catalog-picker-expand-empty"
              >
                <Plus className="mr-1.5 size-3.5" />
                {expandCatalogLabel}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/app/materials/catalog" target="_blank">
                  <BookOpen className="mr-1.5 size-3.5" />
                  {t("materials.catalog.pickerOpenCatalog")}
                </Link>
              </Button>
            </div>
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
              <p
                className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                role="status"
              >
                {t("materials.catalog.pickerAddedCount", { count: String(addedCount) })}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className={cn("gap-2", !createForm && "sm:justify-between")}>
          {createForm ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={savingCreate}
                onClick={() => {
                  setCreateForm(null);
                  setCreateError(null);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!createValid || savingCreate}
                onClick={() => void handleCreateSave()}
                data-testid="catalog-picker-create-save"
              >
                {savingCreate
                  ? t("common.loading")
                  : t("materials.catalog.pickerSaveAndAdd")}
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 sm:mr-auto">
                <Button
                  type="button"
                  variant="default"
                  disabled={!workspaceKey}
                  onClick={openCreateForm}
                  data-testid="catalog-picker-expand"
                >
                  <Plus className="mr-1 size-3.5" />
                  {expandCatalogLabel}
                </Button>
                {onAddCustom ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onAddCustom}
                    data-testid="catalog-picker-add-custom"
                  >
                    {t("projects.draft.quoteItem.addCustom")}
                  </Button>
                ) : null}
              </div>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {addedCount > 0 ? t("common.close") : t("common.cancel")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
