"use client";

/**
 * Vlastné položky — a reusable price list of the company's own PRODUCTS
 * (material with a selling price) and WORKS (labor positions).
 *
 * The user maintains it once here and inserts items into any quote from the
 * "Výkaz a ceny" step ("Pridať z katalógu"). Items are templates — inserting
 * copies name/unit/price into the quote.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileUp, Hammer, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import { MATERIAL_UNITS } from "@/lib/materialCatalog";
import {
  createCatalogItem,
  deleteCatalogItem,
  listCatalogItems,
  updateCatalogItem,
  parseCatalogCsv,
  importParsedCatalogRows,
  CATALOG_CSV_SAMPLE,
  type CatalogItemDoc,
  type CatalogItemKind,
  type ParsedCatalogRow,
} from "@/services/materials";
import type { MaterialUnit } from "@/services/materials";

type KindFilter = "all" | CatalogItemKind;

type EditorState = {
  /** null = creating a new item. */
  itemId: string | null;
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

const EMPTY_EDITOR: EditorState = {
  itemId: null,
  kind: "product",
  name: "",
  description: "",
  unit: "pcs",
  price: "",
};

export default function MaterialsCatalogPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();

  const workspaceKey =
    activeWorkspace && user ? getWorkspaceStorageKey(activeWorkspace, user.id) : null;

  const [items, setItems] = useState<CatalogItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState<CatalogItemDoc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<ParsedCatalogRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvDefaultKind, setCsvDefaultKind] = useState<CatalogItemKind>("work");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(
    null
  );
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!workspaceKey) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listCatalogItems(workspaceKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("materials.catalog.loadError"));
    } finally {
      setLoading(false);
    }
  }, [workspaceKey, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (kindFilter === "all" || i.kind === kindFilter) &&
        (!q ||
          i.name.toLowerCase().includes(q) ||
          (i.description ?? "").toLowerCase().includes(q))
    );
  }, [items, kindFilter, search]);

  const priceNumber = editor ? Number(editor.price) : 0;
  const editorValid =
    !!editor && editor.name.trim().length > 0 && Number.isFinite(priceNumber) && priceNumber >= 0;

  const handleSave = async () => {
    if (!editor || !editorValid || !workspaceKey || !user || savingItem) return;
    setSavingItem(true);
    try {
      if (editor.itemId) {
        await updateCatalogItem(workspaceKey, editor.itemId, {
          kind: editor.kind,
          name: editor.name.trim(),
          description: editor.description.trim() || undefined,
          unit: editor.unit,
          unitPrice: priceNumber,
        });
        setItems((prev) =>
          prev.map((i) =>
            i.id === editor.itemId
              ? {
                  ...i,
                  kind: editor.kind,
                  name: editor.name.trim(),
                  description: editor.description.trim() || undefined,
                  unit: editor.unit,
                  unitPrice: priceNumber,
                }
              : i
          )
        );
      } else {
        const created = await createCatalogItem(workspaceKey, user.id, {
          kind: editor.kind,
          name: editor.name.trim(),
          description: editor.description.trim() || undefined,
          unit: editor.unit,
          unitPrice: priceNumber,
        });
        setItems((prev) =>
          [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      setEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("materials.catalog.saveError"));
    } finally {
      setSavingItem(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteAsk || !workspaceKey || deleting) return;
    setDeleting(true);
    try {
      await deleteCatalogItem(workspaceKey, deleteAsk.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteAsk.id));
      setDeleteAsk(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("materials.catalog.saveError"));
    } finally {
      setDeleting(false);
    }
  };

  const openCsvDialog = () => {
    setCsvFileName(null);
    setCsvRows([]);
    setCsvErrors([]);
    setImportResult(null);
    setCsvOpen(true);
  };

  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCatalogCsv(text);
    setCsvFileName(file.name);
    setCsvRows(parsed.rows);
    setCsvErrors(parsed.errors);
  };

  const handleCsvImport = async () => {
    if (!workspaceKey || !user || importing || csvRows.length === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importParsedCatalogRows(workspaceKey, user.id, csvRows, csvDefaultKind);
      setImportResult(result);
      await load();
      setCsvOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("materials.catalog.saveError"));
    } finally {
      setImporting(false);
    }
  };

  const downloadCsvSample = () => {
    const blob = new Blob([`\uFEFF${CATALOG_CSV_SAMPLE}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cennik-vzor.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCreate = (kind: CatalogItemKind) =>
    setEditor({ ...EMPTY_EDITOR, kind, unit: kind === "work" ? "hour" : "pcs" });

  const openEdit = (item: CatalogItemDoc) =>
    setEditor({
      itemId: item.id,
      kind: item.kind,
      name: item.name,
      description: item.description ?? "",
      unit: item.unit,
      price: item.unitPrice ? String(item.unitPrice) : "",
    });

  if (!workspaceKey) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {t("common.loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("materials.catalog.title")}
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            {t("materials.catalog.lead")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={openCsvDialog}
            disabled={importing}
            data-testid="catalog-import-csv"
          >
            <FileUp className="mr-1.5 size-4" />
            {importing ? t("common.loading") : t("materials.catalog.importCsv")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => openCreate("work")}
            data-testid="catalog-add-work"
          >
            <Hammer className="mr-1.5 size-4" />
            {t("materials.catalog.addWork")}
          </Button>
          <Button
            type="button"
            className="bg-[#e06737] text-white hover:bg-[#c9552b]"
            onClick={() => openCreate("product")}
            data-testid="catalog-add-product"
          >
            <Plus className="mr-1.5 size-4" />
            {t("materials.catalog.addProduct")}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {importResult ? (
        <p
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          role="status"
        >
          {t("materials.catalog.importDone", {
            created: importResult.created,
            skipped: importResult.skipped,
          })}
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
              {(
                [
                  { key: "all", labelKey: "materials.catalog.filterAll" },
                  { key: "product", labelKey: "materials.catalog.filterProducts" },
                  { key: "work", labelKey: "materials.catalog.filterWorks" },
                ] as const
              ).map(({ key, labelKey }) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    kindFilter === key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setKindFilter(key)}
                  aria-pressed={kindFilter === key}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("materials.catalog.searchPlaceholder")}
                className="pl-8"
                aria-label={t("materials.catalog.searchPlaceholder")}
              />
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 py-2" role="status" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted/50" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <BookOpen className="size-10 text-muted-foreground/50" />
              <div>
                <p className="font-medium text-foreground">
                  {t("materials.catalog.emptyTitle")}
                </p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {t("materials.catalog.emptyBody")}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  onClick={openCsvDialog}
                  className="bg-[#1D376A] text-white hover:bg-[#16294f]"
                >
                  <FileUp className="mr-1.5 size-4" />
                  {t("materials.catalog.importCsv")}
                </Button>
                <Button type="button" variant="outline" onClick={() => openCreate("product")}>
                  <Plus className="mr-1.5 size-4" />
                  {t("materials.catalog.addProduct")}
                </Button>
              </div>
            </div>
          ) : visibleItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("materials.catalog.noMatches")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("materials.catalog.colName")}</TableHead>
                  <TableHead className="w-28">{t("materials.catalog.colUnit")}</TableHead>
                  <TableHead className="w-32 text-right">
                    {t("materials.catalog.colPrice")}
                  </TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item) => (
                  <TableRow key={item.id} data-testid="catalog-row">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            item.kind === "work"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800"
                          )}
                        >
                          {item.kind === "work" ? (
                            <Hammer className="size-3" />
                          ) : (
                            <Package className="size-3" />
                          )}
                          {item.kind === "work"
                            ? t("materials.catalog.kindWork")
                            : t("materials.catalog.kindProduct")}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{item.name}</p>
                          {item.description ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {unitLabel(t, item.unit)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPrice(item.unitPrice, item.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(item)}
                          aria-label={t("common.edit")}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteAsk(item)}
                          aria-label={t("common.delete")}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / edit dialog */}
      <Dialog
        open={!!editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editor?.itemId
                ? t("materials.catalog.editTitle")
                : t("materials.catalog.newTitle")}
            </DialogTitle>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(
                  [
                    { kind: "product", labelKey: "materials.catalog.kindProduct", icon: Package },
                    { kind: "work", labelKey: "materials.catalog.kindWork", icon: Hammer },
                  ] as const
                ).map(({ kind, labelKey, icon: Icon }) => (
                  <button
                    key={kind}
                    type="button"
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      editor.kind === kind
                        ? "border-[#1D376A] bg-[#1D376A]/10 text-[#1D376A]"
                        : "border-border text-muted-foreground hover:border-[#1D376A]/40"
                    )}
                    onClick={() =>
                      setEditor((prev) =>
                        prev
                          ? {
                              ...prev,
                              kind,
                              // Works default to hourly; keep an explicit user choice.
                              unit:
                                prev.itemId == null && prev.unit === (kind === "work" ? "pcs" : "hour")
                                  ? kind === "work"
                                    ? "hour"
                                    : "pcs"
                                  : prev.unit,
                            }
                          : prev
                      )
                    }
                    aria-pressed={editor.kind === kind}
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
                  value={editor.name}
                  onChange={(e) =>
                    setEditor((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                  }
                  placeholder={
                    editor.kind === "work"
                      ? t("materials.catalog.namePlaceholderWork")
                      : t("materials.catalog.namePlaceholderProduct")
                  }
                  autoFocus
                  data-testid="catalog-name"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("materials.catalog.colUnit")}
                  </span>
                  <Select
                    value={editor.unit}
                    onValueChange={(v) =>
                      setEditor((prev) => (prev ? { ...prev, unit: v as MaterialUnit } : prev))
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
                    value={editor.price}
                    onChange={(e) =>
                      setEditor((prev) => (prev ? { ...prev, price: e.target.value } : prev))
                    }
                    placeholder="0.00"
                    data-testid="catalog-price"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("materials.catalog.fieldDescription")}
                </span>
                <Input
                  value={editor.description}
                  onChange={(e) =>
                    setEditor((prev) =>
                      prev ? { ...prev, description: e.target.value } : prev
                    )
                  }
                  placeholder={t("materials.catalog.descriptionPlaceholder")}
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!editorValid || savingItem}
              onClick={() => void handleSave()}
              data-testid="catalog-save"
            >
              {savingItem ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV import */}
      <Dialog
        open={csvOpen}
        onOpenChange={(open) => {
          if (!open && !importing) setCsvOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="size-4 text-[#1D376A]" />
              {t("materials.catalog.importCsv")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("materials.catalog.csvBody")}{" "}
              <button
                type="button"
                className="font-medium text-[#1D376A] underline underline-offset-2 hover:text-[#e06737]"
                onClick={downloadCsvSample}
              >
                {t("materials.catalog.csvSample")}
              </button>
            </p>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCsvFile(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => csvInputRef.current?.click()}
              data-testid="catalog-csv-choose"
            >
              <FileUp className="mr-1.5 size-4" />
              {csvFileName ?? t("materials.catalog.csvChooseFile")}
            </Button>

            {csvFileName ? (
              csvRows.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {t("materials.catalog.csvPreviewCount", { count: csvRows.length })}
                  </p>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {csvRows.slice(0, 8).map((row) => (
                      <li key={row.line} className="truncate">
                        {row.name} — {row.price.toFixed(2)} € / {unitLabel(t, row.unit)}
                      </li>
                    ))}
                    {csvRows.length > 8 ? <li>…</li> : null}
                  </ul>
                  <label className="flex items-center justify-between gap-2 border-t border-border pt-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("materials.catalog.csvDefaultKind")}
                    </span>
                    <Select
                      value={csvDefaultKind}
                      onValueChange={(v) => setCsvDefaultKind(v as CatalogItemKind)}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="work">{t("materials.catalog.kindWork")}</SelectItem>
                        <SelectItem value="product">
                          {t("materials.catalog.kindProduct")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              ) : (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {t("materials.catalog.csvNoRows")}
                </p>
              )
            ) : null}

            {csvErrors.length > 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-medium">
                  {t("materials.catalog.csvErrors", { count: csvErrors.length })}
                </p>
                <ul className="mt-1 max-h-20 space-y-0.5 overflow-y-auto">
                  {csvErrors.slice(0, 5).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                  {csvErrors.length > 5 ? <li>…</li> : null}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => setCsvOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={importing || csvRows.length === 0}
              onClick={() => void handleCsvImport()}
              data-testid="catalog-csv-import"
            >
              {importing
                ? t("common.loading")
                : t("materials.catalog.importConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteAsk}
        onOpenChange={(open) => {
          if (!open) setDeleteAsk(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("materials.catalog.deleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("materials.catalog.deleteBody", { name: deleteAsk?.name ?? "" })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteAsk(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
              data-testid="catalog-confirm-delete"
            >
              <Trash2 className="mr-1 size-3.5" />
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
