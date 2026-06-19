"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
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
import { updateDraftJobFields } from "@/services/projects";
import { upsertQuoteFromProject } from "@/services/quotes";
import { useWorkspace } from "@/context/WorkspaceContext";

type DraftQuoteItemsPanelProps = {
  project: ProjectDoc;
  userId: string;
  onProjectUpdated: (project: ProjectDoc) => void;
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
}: {
  category: QuoteDraftItemCategory;
  items: QuoteDraftItemDoc[];
  projectId: string;
  rowActionBusy: boolean;
  onItemsChanged: (itemId: string, patch: Partial<QuoteDraftItemDoc>) => void;
  onReloadSilent: () => Promise<void>;
  setRowActionBusy: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dirtyIds = useRef<Set<string>>(new Set());
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    setRows((prev) => {
      const next = { ...prev };
      const serverIds = new Set(items.map((i) => i.id));

      for (const id of Object.keys(next)) {
        if (!serverIds.has(id)) {
          delete next[id];
          dirtyIds.current.delete(id);
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
    async (itemId: string, draft: RowDraft) => {
      const trimmedName = draft.name.trim();
      if (!trimmedName) return;

      setError(null);
      try {
        await updateQuoteDraftItem(projectId, itemId, {
          category,
          name: trimmedName,
          qty: draft.qty,
          unit: draft.unit,
          unitPrice: draft.unitPrice,
          note: draft.note || undefined,
        });
        dirtyIds.current.delete(itemId);
        onItemsChanged(itemId, {
          name: trimmedName,
          qty: draft.qty,
          unit: draft.unit,
          unitPrice: draft.unitPrice,
          note: draft.note || undefined,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
      }
    },
    [category, projectId, onItemsChanged, setError, t]
  );

  const scheduleSave = useCallback(
    (itemId: string, draft: RowDraft, delayMs = 900) => {
      if (saveTimers.current[itemId]) clearTimeout(saveTimers.current[itemId]);
      saveTimers.current[itemId] = setTimeout(() => {
        delete saveTimers.current[itemId];
        void persistRow(itemId, draft);
      }, delayMs);
    },
    [persistRow]
  );

  const flushSave = useCallback(
    (itemId: string) => {
      if (saveTimers.current[itemId]) {
        clearTimeout(saveTimers.current[itemId]);
        delete saveTimers.current[itemId];
      }
      const draft = rowsRef.current[itemId];
      if (draft) void persistRow(itemId, draft);
    },
    [persistRow]
  );

  const patchRow = (itemId: string, patch: Partial<RowDraft>, opts?: { debounce?: boolean }) => {
    dirtyIds.current.add(itemId);
    setRows((prev) => {
      const base = prev[itemId] ?? { name: "", qty: 1, unit: "ks", unitPrice: 0, note: "" };
      const next = { ...base, ...patch };
      const updated = { ...prev, [itemId]: next };
      rowsRef.current = updated;
      onItemsChanged(itemId, {
        name: next.name,
        qty: next.qty,
        unit: next.unit,
        unitPrice: next.unitPrice,
      });
      if (opts?.debounce !== false) {
        scheduleSave(itemId, next);
      }
      return updated;
    });
  };

  const handleAdd = async () => {
    setRowActionBusy(true);
    setError(null);
    try {
      await createQuoteDraftItem(projectId, {
        category,
        name: t("projects.draft.quoteItem.newItem"),
        qty: 1,
        unit: "ks",
        unitPrice: 0,
      });
      await onReloadSilent();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
    } finally {
      setRowActionBusy(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (saveTimers.current[itemId]) {
      clearTimeout(saveTimers.current[itemId]);
      delete saveTimers.current[itemId];
    }
    dirtyIds.current.delete(itemId);

    setRowActionBusy(true);
    setError(null);
    try {
      await deleteQuoteDraftItem(projectId, itemId);
      await onReloadSilent();
    } catch (e) {
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t(titleKey)}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rowActionBusy}
          onClick={handleAdd}
        >
          <Plus className="size-4 mr-1" />
          {t("projects.draft.quoteItem.add")}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("projects.draft.quoteItem.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("projects.draft.quoteItem.name")}</TableHead>
                <TableHead className="w-20">{t("projects.draft.quoteItem.qty")}</TableHead>
                <TableHead className="w-24">{t("projects.draft.quoteItem.unit")}</TableHead>
                <TableHead className="w-28">{t("projects.draft.quoteItem.unitPrice")}</TableHead>
                <TableHead className="w-28 text-right">
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
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input
                        value={row.name}
                        onChange={(e) => patchRow(item.id, { name: e.target.value })}
                        onBlur={() => flushSave(item.id)}
                        className="h-8 min-w-[140px]"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.qty}
                        onChange={(e) =>
                          patchRow(item.id, { qty: parseFloat(e.target.value) || 0 })
                        }
                        onBlur={() => flushSave(item.id)}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.unit}
                        onValueChange={(v) => {
                          patchRow(item.id, { unit: v ?? row.unit }, { debounce: false });
                          flushSave(item.id);
                        }}
                      >
                        <SelectTrigger className="h-8">
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
                    <TableCell>
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
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatMoney(total)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={rowActionBusy}
                        onClick={() => handleDelete(item.id)}
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
    </div>
  );
}

export function DraftQuoteItemsPanel({
  project,
  userId,
  onProjectUpdated,
}: DraftQuoteItemsPanelProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { activeWorkspace } = useWorkspace();
  const [items, setItems] = useState<QuoteDraftItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowActionBusy, setRowActionBusy] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vatPercent, setVatPercent] = useState(project.quoteDraftVatPercent ?? 20);
  const [notes, setNotes] = useState(project.quoteDraftNotes ?? "");
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const list = await listProjectQuoteDraftItems(project.id);
        setItems(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.loadError"));
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [project.id, t]
  );

  const loadSilent = useCallback(async () => {
    await load({ silent: true });
  }, [load]);

  const handleItemChanged = useCallback((itemId: string, patch: Partial<QuoteDraftItemDoc>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVatPercent(project.quoteDraftVatPercent ?? 20);
    setNotes(project.quoteDraftNotes ?? "");
  }, [project.quoteDraftVatPercent, project.quoteDraftNotes]);

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
      try {
        const updated = await updateDraftJobFields(project.id, {
          quoteDraftVatPercent: vat,
          quoteDraftNotes: noteText,
        });
        onProjectUpdated(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("projects.draft.quoteItem.saveError"));
      }
    }, 800);
  };

  const hasItems = items.length > 0;

  const handleCreateQuote = async () => {
    if (!activeWorkspace || !hasItems) return;
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("projects.draft.sectionQuoteItems")}</CardTitle>
        <CardDescription>{t("projects.draft.quoteItemsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            <CategoryTable
              category="material"
              items={materials}
              projectId={project.id}
              rowActionBusy={rowActionBusy}
              onItemsChanged={handleItemChanged}
              onReloadSilent={loadSilent}
              setRowActionBusy={setRowActionBusy}
              setError={setError}
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

            <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
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
              <Button type="button" variant="outline" size="sm" disabled title={t("dashboard.comingSoon")}>
                {t("projects.draft.sendQuote")}
                <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                  {t("dashboard.comingSoon")}
                </span>
              </Button>
            </div>
          </>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
