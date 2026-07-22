"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Loader2,
  Ruler,
  BookOpen,
  AlertTriangle,
  CircleDollarSign,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nContext";
import { formatMoney } from "@/lib/format";
import { computeItemTotal, computeEstimateTotals } from "@/lib/estimateUtils";
import type { ProjectDoc } from "@/lib/projects";
import {
  listProjectQuoteDraftItems,
  createQuoteDraftItem,
  updateQuoteDraftItem,
  deleteQuoteDraftItem,
  type QuoteDraftItemDoc,
  type QuoteDraftItemCategory,
} from "@/lib/projects";
import { QUOTE_DRAFT_UNITS } from "@/lib/quoteDraftItems";
import { takeoffRoute } from "@/lib/takeoff/takeoffMode";
import { updateDraftJobFields } from "@/services/projects";
import { upsertQuoteFromProject } from "@/services/quotes";
import { useWorkspace } from "@/context/WorkspaceContext";
import { CatalogItemPickerDialog } from "@/components/projects/setup/CatalogItemPickerDialog";
import { ElectricalCatalogPickerDialog } from "@/components/jobs/ElectricalCatalogPickerDialog";
import { AiPriceLookupDialog } from "@/components/takeoff/AiPriceLookupDialog";
import type { CatalogItemDoc } from "@/services/materials";
import type { ElectricalCatalogProduct } from "@/lib/catalog/electrical/types";
import { productUnitPriceEur } from "@/services/catalog/electricalCatalogReadService";
import {
  catalogUnitToQuoteDraftUnit,
  mergeQuoteDraftPlainNotes,
  projectHasQuoteCustomer,
  shouldConfirmQuoteItemDelete,
  shouldShowQuoteCustomerHint,
} from "@/lib/manualQuoteWorkspace";
import {
  nextAutosaveGeneration,
  shouldApplyAutosaveResult,
} from "@/lib/quoteDraftAutosave";
import { plainNotesFromQuoteDraft } from "@/components/projects/setup/aiSetupHelpers";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type DraftQuoteItemsPanelProps = {
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
  onQuoteItemsChanged?: (items: QuoteDraftItemDoc[]) => void;
};

type RowDraft = {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  note: string;
};

function toRowDraft(item: QuoteDraftItemDoc): RowDraft {
  return {
    name: item.name,
    qty: item.qty,
    unit: item.unit,
    unitPrice: item.unitPrice,
    note: item.note ?? "",
  };
}

function CategoryTable({
  category,
  items,
  projectId,
  rowActionBusy,
  onItemsChanged,
  onReloadSilent,
  setRowActionBusy,
  setError,
  setSaveStatus,
  onOpenCatalog,
}: {
  category: QuoteDraftItemCategory;
  items: QuoteDraftItemDoc[];
  projectId: string;
  rowActionBusy: boolean;
  onItemsChanged: (itemId: string, patch: Partial<QuoteDraftItemDoc>) => void;
  onReloadSilent: () => Promise<void>;
  setRowActionBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
  setSaveStatus: (v: SaveStatus) => void;
  /** Opens product picker modal instead of inserting a blank row. */
  onOpenCatalog: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const [priceLookupItemId, setPriceLookupItemId] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dirtyIds = useRef<Set<string>>(new Set());
  const saveGeneration = useRef<Record<string, number>>({});
  const rowsRef = useRef(rows);
  const persistRowRef = useRef<(itemId: string) => Promise<void>>(async () => {});
  rowsRef.current = rows;
  const priceLookupItem = priceLookupItemId
    ? items.find((i) => i.id === priceLookupItemId) ?? null
    : null;
  const priceLookupName =
    (priceLookupItemId && rows[priceLookupItemId]?.name) ||
    priceLookupItem?.name ||
    "";

  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      const serverIds = new Set(items.map((i) => i.id));

      for (const id of Object.keys(next)) {
        if (!serverIds.has(id)) {
          delete next[id];
          dirtyIds.current.delete(id);
          delete saveGeneration.current[id];
        }
      }

      for (const item of items) {
        if (!prev[item.id]) {
          next[item.id] = toRowDraft(item);
          continue;
        }
        if (!dirtyIds.current.has(item.id)) {
          next[item.id] = toRowDraft(item);
        }
      }

      return next;
    });
  }, [items]);

  const persistRow = useCallback(
    async (itemId: string) => {
      const draft = rowsRef.current[itemId];
      if (!draft) return;
      const trimmedName = draft.name.trim();
      if (!trimmedName) return;

      // Capture generation at write start; patchRow bumps it on newer edits.
      const writeGen = saveGeneration.current[itemId] ?? 0;

      setError(null);
      setSaveStatus("saving");
      try {
        await updateQuoteDraftItem(projectId, itemId, {
          category,
          name: trimmedName,
          qty: draft.qty,
          unit: draft.unit,
          unitPrice: draft.unitPrice,
          note: draft.note || undefined,
        });
        if (
          !shouldApplyAutosaveResult(writeGen, saveGeneration.current[itemId] ?? 0)
        ) {
          return;
        }
        dirtyIds.current.delete(itemId);
        onItemsChanged(itemId, {
          name: trimmedName,
          qty: draft.qty,
          unit: draft.unit,
          unitPrice: draft.unitPrice,
          note: draft.note || undefined,
        });
        setSaveStatus("saved");
      } catch (e) {
        if (
          !shouldApplyAutosaveResult(writeGen, saveGeneration.current[itemId] ?? 0)
        ) {
          return;
        }
        setSaveStatus("error");
        setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
      }
    },
    [category, projectId, onItemsChanged, setError, setSaveStatus, t]
  );
  persistRowRef.current = persistRow;

  const scheduleSave = useCallback((itemId: string, delayMs = 900) => {
    if (saveTimers.current[itemId]) clearTimeout(saveTimers.current[itemId]);
    saveTimers.current[itemId] = setTimeout(() => {
      delete saveTimers.current[itemId];
      void persistRowRef.current(itemId);
    }, delayMs);
  }, []);

  const flushSave = useCallback((itemId: string) => {
    if (saveTimers.current[itemId]) {
      clearTimeout(saveTimers.current[itemId]);
      delete saveTimers.current[itemId];
    }
    void persistRowRef.current(itemId);
  }, []);

  // Flush dirty rows on unmount / navigate away without setState (avoids unmounted updates).
  useEffect(() => {
    const timers = saveTimers.current;
    const dirty = dirtyIds.current;
    const rowsSnapshot = rowsRef;
    return () => {
      for (const itemId of Object.keys(timers)) {
        clearTimeout(timers[itemId]);
        delete timers[itemId];
      }
      for (const itemId of dirty) {
        const draft = rowsSnapshot.current[itemId];
        const trimmedName = draft?.name.trim();
        if (!draft || !trimmedName) continue;
        void updateQuoteDraftItem(projectId, itemId, {
          category,
          name: trimmedName,
          qty: draft.qty,
          unit: draft.unit,
          unitPrice: draft.unitPrice,
          note: draft.note || undefined,
        }).catch(() => {
          /* best-effort flush */
        });
      }
    };
  }, [category, projectId]);

  const patchRow = (itemId: string, patch: Partial<RowDraft>, opts?: { debounce?: boolean }) => {
    dirtyIds.current.add(itemId);
    // Bump generation so an older in-flight write cannot win after a newer edit.
    saveGeneration.current[itemId] = nextAutosaveGeneration(saveGeneration.current[itemId]);

    const base =
      rowsRef.current[itemId] ?? { name: "", qty: 1, unit: "ks", unitPrice: 0, note: "" };
    const next = { ...base, ...patch };
    const updated = { ...rowsRef.current, [itemId]: next };
    rowsRef.current = updated;
    setRows(updated);

    // Never call parent setState inside a setState updater / child render.
    queueMicrotask(() => {
      onItemsChanged(itemId, {
        name: next.name,
        qty: next.qty,
        unit: next.unit,
        unitPrice: next.unitPrice,
        note: next.note || undefined,
      });
    });

    if (opts?.debounce !== false) {
      scheduleSave(itemId);
    }
  };

  const handleDelete = async (itemId: string) => {
    const draft = rowsRef.current[itemId];
    const qty = draft?.qty ?? items.find((i) => i.id === itemId)?.qty ?? 0;
    const unitPrice = draft?.unitPrice ?? items.find((i) => i.id === itemId)?.unitPrice ?? 0;
    if (
      shouldConfirmQuoteItemDelete(qty, unitPrice) &&
      !window.confirm(t("projects.draft.quoteItem.deleteConfirm"))
    ) {
      return;
    }

    if (saveTimers.current[itemId]) {
      clearTimeout(saveTimers.current[itemId]);
      delete saveTimers.current[itemId];
    }
    dirtyIds.current.delete(itemId);

    setRowActionBusy(true);
    setError(null);
    setSaveStatus("saving");
    try {
      await deleteQuoteDraftItem(projectId, itemId);
      await onReloadSilent();
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
    } finally {
      setRowActionBusy(false);
    }
  };

  const titleKey =
    category === "material"
      ? "projects.draft.quoteItem.materials"
      : "projects.draft.quoteItem.work";

  return (
    <div className="space-y-3" data-testid={`quote-category-${category}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t(titleKey)}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rowActionBusy}
          onClick={onOpenCatalog}
          data-testid={`quote-add-${category}`}
        >
          <Plus className="size-4 mr-1" />
          {t("projects.draft.quoteItem.add")}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("projects.draft.quoteItem.empty")}</p>
      ) : (
        <div className="rounded-md border">
          <Table className="table-fixed min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-auto min-w-0">
                  {t("projects.draft.quoteItem.name")}
                </TableHead>
                <TableHead className="w-[5.5rem]">
                  {t("projects.draft.quoteItem.qty")}
                </TableHead>
                <TableHead className="w-[5.5rem]">
                  {t("projects.draft.quoteItem.unit")}
                </TableHead>
                <TableHead className="w-[7.5rem]">
                  {t("projects.draft.quoteItem.unitPrice")}
                </TableHead>
                <TableHead className="w-[6.5rem] text-right">
                  {t("projects.draft.quoteItem.total")}
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const row = rows[item.id] ?? toRowDraft(item);
                const total = computeItemTotal(row.qty, row.unitPrice);
                return (
                  <TableRow key={item.id} data-testid="quote-draft-row">
                    <TableCell className="min-w-0 whitespace-normal align-top">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Input
                          value={row.name}
                          onChange={(e) => patchRow(item.id, { name: e.target.value })}
                          onBlur={() => flushSave(item.id)}
                          className="h-8 w-full min-w-0"
                          aria-label={t("projects.draft.quoteItem.name")}
                        />
                        <Input
                          value={row.note}
                          onChange={(e) => patchRow(item.id, { note: e.target.value })}
                          onBlur={() => flushSave(item.id)}
                          className="h-7 w-full min-w-0 text-xs"
                          placeholder={t("projects.draft.quoteItem.descriptionPlaceholder")}
                          aria-label={t("projects.draft.quoteItem.description")}
                        />
                        {item.sourceDrawingId &&
                        item.sourceOfQuantity === "symbol_detection" &&
                        (item.evidenceCount ?? 0) > 0 ? (
                          <Link
                            href={takeoffRoute({
                              projectId,
                              drawingId: item.sourceDrawingId,
                              mode: "quote",
                            })}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                            data-testid="quote-item-evidence-link"
                          >
                            <Ruler className="size-3" aria-hidden />
                            {t("takeoff.quote.evidenceLink", {
                              count: item.evidenceCount ?? 0,
                            })}
                          </Link>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.qty}
                        onChange={(e) =>
                          patchRow(item.id, { qty: parseFloat(e.target.value) || 0 })
                        }
                        onBlur={() => flushSave(item.id)}
                        className="h-8 w-full min-w-0 tabular-nums"
                        aria-label={t("projects.draft.quoteItem.qty")}
                      />
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <Select
                        value={row.unit}
                        onValueChange={(v) => {
                          patchRow(item.id, { unit: v ?? row.unit }, { debounce: false });
                          flushSave(item.id);
                        }}
                      >
                        <SelectTrigger
                          className="h-8 w-full min-w-0"
                          aria-label={t("projects.draft.quoteItem.unit")}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {QUOTE_DRAFT_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.unitPrice}
                          onChange={(e) =>
                            patchRow(item.id, {
                              unitPrice: parseFloat(e.target.value) || 0,
                            })
                          }
                          onBlur={() => flushSave(item.id)}
                          className="h-8 w-full min-w-0 tabular-nums"
                          aria-label={t("projects.draft.quoteItem.unitPrice")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          disabled={rowActionBusy || !row.name.trim()}
                          title={t("takeoff.priceLookup.buttonHint")}
                          aria-label={t("takeoff.priceLookup.button")}
                          data-testid="quote-add-price"
                          onClick={() => setPriceLookupItemId(item.id)}
                        >
                          <CircleDollarSign className="size-4 text-[#e06737]" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right text-sm tabular-nums whitespace-nowrap">
                      {formatMoney(total)}
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={rowActionBusy}
                        onClick={() => void handleDelete(item.id)}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {priceLookupItemId && priceLookupName ? (
        <AiPriceLookupDialog
          open
          productName={priceLookupName}
          onOpenChange={(next) => {
            if (!next) setPriceLookupItemId(null);
          }}
          onApply={async ({ unitPrice, note }) => {
            const existingNote = rowsRef.current[priceLookupItemId]?.note?.trim();
            patchRow(
              priceLookupItemId,
              {
                unitPrice,
                ...(note
                  ? {
                      note: existingNote ? `${existingNote} · ${note}` : note,
                    }
                  : {}),
              },
              { debounce: false }
            );
            await persistRowRef.current(priceLookupItemId);
            setPriceLookupItemId(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function DraftQuoteItemsPanel({
  project,
  userId,
  onProjectUpdated,
  onQuoteItemsChanged,
}: DraftQuoteItemsPanelProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { activeWorkspace } = useWorkspace();
  const [items, setItems] = useState<QuoteDraftItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowActionBusy, setRowActionBusy] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [electricalCatalogOpen, setElectricalCatalogOpen] = useState(false);
  const [companyCatalogOpen, setCompanyCatalogOpen] = useState(false);
  const [catalogPreferredCategory, setCatalogPreferredCategory] =
    useState<QuoteDraftItemCategory>("material");

  const openCatalog = (category: QuoteDraftItemCategory = "material") => {
    setCatalogPreferredCategory(category);
    setElectricalCatalogOpen(true);
  };
  const [vatPercent, setVatPercent] = useState(project.quoteDraftVatPercent ?? 20);
  const [notes, setNotes] = useState(() => plainNotesFromQuoteDraft(project.quoteDraftNotes));
  const quoteDraftNotesRef = useRef(project.quoteDraftNotes);
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const list = await listProjectQuoteDraftItems(project.id);
        setItems(list);
        onQuoteItemsChanged?.(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.loadError"));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [project.id, t, onQuoteItemsChanged]
  );

  const loadSilent = useCallback(async () => {
    await load({ silent: true });
  }, [load]);

  const handleItemChanged = useCallback((itemId: string, patch: Partial<QuoteDraftItemDoc>) => {
    setItems((prev) => {
      const next = prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
      // Notify parent after commit — not inside the updater body.
      queueMicrotask(() => onQuoteItemsChanged?.(next));
      return next;
    });
  }, [onQuoteItemsChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVatPercent(project.quoteDraftVatPercent ?? 20);
    setNotes(plainNotesFromQuoteDraft(project.quoteDraftNotes));
    quoteDraftNotesRef.current = project.quoteDraftNotes;
  }, [project.quoteDraftVatPercent, project.quoteDraftNotes]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [saveStatus]);

  const materials = useMemo(
    () => items.filter((i) => i.category === "material"),
    [items]
  );
  const workItems = useMemo(() => items.filter((i) => i.category === "work"), [items]);

  const itemsWithTotals = items.map((item) => ({
    total: computeItemTotal(item.qty, item.unitPrice),
  }));
  const { subtotal, vatAmount, grandTotal } = computeEstimateTotals(
    itemsWithTotals,
    vatPercent
  );

  const scheduleMetaSave = (vat: number, noteText: string) => {
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(async () => {
      setError(null);
      setSaveStatus("saving");
      try {
        const mergedNotes = mergeQuoteDraftPlainNotes(
          quoteDraftNotesRef.current,
          noteText
        );
        const updated = await updateDraftJobFields(project.id, {
          quoteDraftVatPercent: vat,
          quoteDraftNotes: mergedNotes,
        });
        quoteDraftNotesRef.current = updated.quoteDraftNotes ?? mergedNotes;
        onProjectUpdated(updated);
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("error");
        setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
      }
    }, 800);
  };

  const hasItems = items.length > 0;
  const showCustomerHint = shouldShowQuoteCustomerHint(project);

  const handleAddCustom = async (category: QuoteDraftItemCategory = "material") => {
    setRowActionBusy(true);
    setError(null);
    setSaveStatus("saving");
    try {
      await createQuoteDraftItem(project.id, {
        category,
        name: t("projects.draft.quoteItem.newItem"),
        qty: 1,
        unit: "ks",
        unitPrice: 0,
      });
      await loadSilent();
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
    } finally {
      setRowActionBusy(false);
    }
  };

  const handlePickCatalogItem = async (item: CatalogItemDoc) => {
    setRowActionBusy(true);
    setError(null);
    setSaveStatus("saving");
    try {
      await createQuoteDraftItem(project.id, {
        category: item.kind === "work" ? "work" : "material",
        name: item.name,
        qty: 1,
        unit: catalogUnitToQuoteDraftUnit(item.unit),
        unitPrice: item.unitPrice >= 0 ? item.unitPrice : 0,
        note: item.description?.trim() || undefined,
      });
      await loadSilent();
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
    } finally {
      setRowActionBusy(false);
    }
  };

  const handlePickElectricalProduct = async (product: ElectricalCatalogProduct) => {
    setRowActionBusy(true);
    setError(null);
    setSaveStatus("saving");
    try {
      const noteParts = [
        product.brand,
        product.series,
        product.supplierSku ? `kód ${product.supplierSku}` : null,
      ].filter(Boolean);
      await createQuoteDraftItem(project.id, {
        category: catalogPreferredCategory,
        name: product.name,
        qty: 1,
        unit: "ks",
        unitPrice: productUnitPriceEur(product),
        note: noteParts.length ? noteParts.join(" · ") : undefined,
      });
      await loadSilent();
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
    } finally {
      setRowActionBusy(false);
    }
  };

  const handleCreateQuote = async () => {
    if (!activeWorkspace || !hasItems) return;
    if (!projectHasQuoteCustomer(project)) {
      setError(t("projects.draft.quoteItem.needCustomer"));
      return;
    }
    setCreatingQuote(true);
    setError(null);
    try {
      const quoteId = await upsertQuoteFromProject(activeWorkspace, userId, project.id);
      router.push(`/app/quotes/${quoteId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("quotes.createError"));
    } finally {
      setCreatingQuote(false);
    }
  };

  const handleSendClick = () => {
    if (!projectHasQuoteCustomer(project)) {
      setError(t("projects.draft.quoteItem.needCustomer"));
      return;
    }
  };

  const saveStatusLabel =
    saveStatus === "saving"
      ? t("projects.draft.quoteItem.saving")
      : saveStatus === "saved"
        ? t("projects.draft.quoteItem.saved")
        : saveStatus === "error"
          ? t("projects.draft.quoteItem.saveError")
          : null;

  return (
    <Card data-testid="manual-quote-editor">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t("projects.draft.sectionQuoteItems")}</CardTitle>
            <CardDescription>{t("projects.draft.quoteItemsHint")}</CardDescription>
          </div>
          {saveStatusLabel ? (
            <p
              className={
                saveStatus === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
              role="status"
              aria-live="polite"
              data-testid="quote-save-status"
            >
              {saveStatus === "saving" ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  {saveStatusLabel}
                </span>
              ) : (
                saveStatusLabel
              )}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {showCustomerHint ? (
          <div
            className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950"
            role="status"
            data-testid="quote-customer-hint"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <p>{t("projects.draft.quoteItem.customerHint")}</p>
              <Link
                href={`/app/projects/${project.id}?tab=overview`}
                className="mt-1 inline-block text-sm font-medium text-[#e06737] hover:underline"
              >
                {t("projects.draft.quoteItem.openCustomer")}
              </Link>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : !hasItems ? (
          <div
            className="rounded-lg border border-dashed border-border px-4 py-8 text-center space-y-4"
            data-testid="quote-empty-state"
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                {t("projects.draft.quoteItem.emptyTitle")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t("projects.draft.quoteItem.emptyBody")}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-[#e06737] hover:bg-[#c95a30] text-white"
                disabled={rowActionBusy}
                onClick={() => openCatalog("material")}
                data-testid="quote-empty-open-catalog"
              >
                <BookOpen className="size-4 mr-1" />
                {t("projects.draft.quoteItem.add")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rowActionBusy}
                onClick={() => void handleAddCustom("material")}
                data-testid="quote-empty-add-custom"
              >
                <Plus className="size-4 mr-1" />
                {t("projects.draft.quoteItem.addCustom")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-[#e06737] hover:bg-[#c95a30] text-white"
                disabled={rowActionBusy}
                onClick={() => openCatalog("material")}
                data-testid="quote-toolbar-open-catalog"
              >
                <BookOpen className="size-4 mr-1" />
                {t("projects.draft.quoteItem.add")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rowActionBusy}
                onClick={() => void handleAddCustom("material")}
                data-testid="quote-toolbar-add-custom"
              >
                <Plus className="size-4 mr-1" />
                {t("projects.draft.quoteItem.addCustom")}
              </Button>
            </div>

            <CategoryTable
              category="material"
              items={materials}
              projectId={project.id}
              rowActionBusy={rowActionBusy}
              onItemsChanged={handleItemChanged}
              onReloadSilent={loadSilent}
              setRowActionBusy={setRowActionBusy}
              setError={setError}
              setSaveStatus={setSaveStatus}
              onOpenCatalog={() => openCatalog("material")}
            />
            <CategoryTable
              category="work"
              items={workItems}
              projectId={project.id}
              rowActionBusy={rowActionBusy}
              onItemsChanged={handleItemChanged}
              onReloadSilent={loadSilent}
              setRowActionBusy={setRowActionBusy}
              setError={setError}
              setSaveStatus={setSaveStatus}
              onOpenCatalog={() => openCatalog("work")}
            />

            <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
              <div>
                <Label htmlFor="quote-vat">{t("projects.draft.quoteItem.vat")}</Label>
                <Input
                  id="quote-vat"
                  type="number"
                  min={0}
                  max={100}
                  value={vatPercent}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    const next = Number.isFinite(v) ? v : 0;
                    setVatPercent(next);
                    scheduleMetaSave(next, notes);
                  }}
                  className="mt-1 max-w-[120px]"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="quote-notes">{t("projects.draft.quoteItem.notes")}</Label>
                <Textarea
                  id="quote-notes"
                  value={notes}
                  rows={2}
                  placeholder={t("projects.draft.quoteItem.notesPlaceholder")}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    scheduleMetaSave(vatPercent, e.target.value);
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm" data-testid="quote-totals">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("projects.draft.quoteItem.subtotal")}</span>
                <span className="tabular-nums font-medium">{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("projects.draft.quoteItem.vatLine", { percent: vatPercent })}
                </span>
                <span className="tabular-nums">{formatMoney(vatAmount)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t">
                <span className="font-medium">{t("projects.draft.quoteItem.grandTotal")}</span>
                <span className="tabular-nums font-semibold">{formatMoney(grandTotal)}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{t("projects.draft.quoteItem.disclaimer")}</p>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!hasItems || creatingQuote || !activeWorkspace}
                className="bg-[#e06737] hover:bg-[#c95a30] text-white"
                title={!hasItems ? t("projects.draft.quoteItem.needItems") : undefined}
                onClick={() => void handleCreateQuote()}
                data-testid="quote-create-from-project"
              >
                {creatingQuote ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : null}
                {t("quotes.createFromProject")}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled title={t("dashboard.comingSoon")}>
                {t("projects.draft.exportPdf")}
                <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                  {t("dashboard.comingSoon")}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled
                title={t("dashboard.comingSoon")}
                onClick={handleSendClick}
                data-testid="quote-send"
              >
                {t("projects.draft.sendQuote")}
                <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                  {t("dashboard.comingSoon")}
                </span>
              </Button>
            </div>
          </>
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert" data-testid="quote-error">
            {error}
          </p>
        ) : null}
      </CardContent>

      <ElectricalCatalogPickerDialog
        open={electricalCatalogOpen}
        onOpenChange={setElectricalCatalogOpen}
        onPick={(product) => {
          void handlePickElectricalProduct(product);
        }}
        onAddCustom={() => {
          setElectricalCatalogOpen(false);
          void handleAddCustom(catalogPreferredCategory);
        }}
        onOpenCompanyCatalog={() => {
          setElectricalCatalogOpen(false);
          setCompanyCatalogOpen(true);
        }}
      />

      <CatalogItemPickerDialog
        open={companyCatalogOpen}
        onOpenChange={setCompanyCatalogOpen}
        onPick={(item) => {
          void handlePickCatalogItem(item);
        }}
        onAddCustom={() => {
          setCompanyCatalogOpen(false);
          void handleAddCustom(catalogPreferredCategory);
        }}
      />
    </Card>
  );
}
