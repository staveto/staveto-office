"use client";

/**
 * Phase 2 — right-side review panel for region symbol candidates.
 * Grouped by category; confirm / reject / change type / mark unknown.
 * Confirmed candidates leave the active list; rejected stay stored but hidden.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  X,
  HelpCircle,
  Pencil,
  ChevronDown,
  ChevronRight,
  CheckCheck,
  Copy,
  Trash2,
  MapPin,
  Plus,
  Highlighter,
  MousePointerClick,
  FolderInput,
  Sparkles,
  CircleDollarSign,
  Hammer,
  Library,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nContext";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { ElectricalCatalogPickerDialog } from "@/components/jobs/ElectricalCatalogPickerDialog";
import { CatalogItemPickerDialog } from "@/components/projects/setup/CatalogItemPickerDialog";
import { AiPriceLookupDialog } from "@/components/takeoff/AiPriceLookupDialog";
import type { ElectricalCatalogProduct } from "@/lib/catalog/electrical/types";
import {
  loadElectricalCatalog,
  productUnitPriceEur,
} from "@/services/catalog/electricalCatalogReadService";
import { resolveCatalogProductImageUrl } from "@/lib/catalog/electrical/images";
import { symbolTypeFromElectricalProduct } from "@/lib/takeoff/electricalProductSymbolType";
import type { CatalogItemDoc } from "@/services/materials";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";
import type { TakeoffItem } from "@/types/pdfTakeoff";
import {
  colorLayerAccent,
  defaultSymbolTypeForCandidate,
  groupCandidatesForReview,
} from "@/lib/takeoff/candidateReview";
import { SELECTED_HIGHLIGHT_COLOR } from "@/lib/takeoff/selectionHighlight";
import {
  categoryKeyForLabel,
  categoryLabelForCandidate,
  categoryMarkerScaleForKey,
  CATEGORY_MARKER_SCALE_MAX,
  CATEGORY_MARKER_SCALE_MIN,
  groupConfirmedByCategory,
  categoryNoteForKey,
  setCategoryColorOverride,
  setCategoryMarkerScaleOverride,
  setCategoryNoteOverride,
  uniquifyCategoryLabel,
} from "@/lib/takeoff/takeoffCategories";
import { MarkColorPicker } from "@/components/takeoff/MarkColorPicker";
import { LegendOnlyBadge } from "./LegendOnlyBadge";

function sourceLabelKey(source: AnalyzeRegionCandidateDto["source"]): string {
  switch (source) {
    case "template_match":
      return "takeoff.review.source.templateMatch";
    case "manual":
      return "takeoff.review.source.manual";
    case "mixed":
      return "takeoff.review.source.mixed";
    case "ocr":
      return "takeoff.review.source.ocr";
    case "gemini":
      return "takeoff.review.source.gemini";
    case "opencv":
    default:
      return "takeoff.review.source.analyzeRegion";
  }
}

function statusLabelKey(status: AnalyzeRegionCandidateDto["status"]): string {
  switch (status) {
    case "probable":
      return "takeoff.review.status.probable";
    case "confirmed":
      return "takeoff.review.status.confirmed";
    case "rejected":
      return "takeoff.review.status.rejected";
    case "unknown_type":
      return "takeoff.review.status.unknownType";
    case "needs_customer_info":
      return "takeoff.review.status.needsInfo";
    case "candidate":
    default:
      return "takeoff.review.status.candidate";
  }
}

const SYMBOL_TYPE_OPTIONS = [
  "socket",
  "switch",
  "light",
  "led_strip",
  "distribution_board",
  "generic",
  "unknown",
] as const;

export type EvidenceThumb = {
  id: string;
  url: string | null;
  pageNumber: number;
  normalized?: { x: number; y: number; width: number; height: number };
};

type Props = {
  candidates: AnalyzeRegionCandidateDto[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  takeoffItems: TakeoffItem[];
  busy?: boolean;
  onConfirm: (candidateId: string, symbolType: string) => Promise<void>;
  onReject: (candidateId: string) => Promise<void>;
  onChangeType: (candidateId: string, symbolType: string) => Promise<void>;
  /**
   * Retype an already-CONFIRMED symbol — moves its quantity to the new
   * takeoff item bucket. Undefined hides "Zmeniť typ" on confirmed rows.
   */
  onChangeConfirmedType?: (candidateId: string, symbolType: string) => Promise<void>;
  onMarkUnknown: (candidateId: string) => Promise<void>;
  onConfirmAllProbable: () => Promise<void>;
  /** Permanently remove a candidate/probable/uncertain/rejected row. */
  onDeleteCandidate?: (candidateId: string) => Promise<void>;
  /** Delete a CONFIRMED symbol — reverses its quantity/evidence first. */
  onDeleteConfirmed?: (candidateId: string) => Promise<void>;
  /** Bulk-clear every rejected/hidden row in one action. */
  onDeleteAllRejected?: () => Promise<void>;
  /** Bulk-clear every row still awaiting review (never confirmed/rejected). */
  onDeleteAllCandidates?: () => Promise<void>;
  onEvidenceClick: (takeoffItemId: string) => void;
  /** Evidence thumbnails for the last clicked takeoff item (Phase 2.5). */
  evidenceThumbs?: { itemId: string; itemName: string; thumbs: EvidenceThumb[] } | null;
  onEvidenceThumbClick?: (thumb: EvidenceThumb) => void;
  /** False in readonly/document mode — hides confirm/reject/change actions. */
  canReview?: boolean;
  /**
   * Search for visually similar symbols starting from THIS candidate —
   * available before confirming, so a manual/single mark doesn't require a
   * confirm step first just to bump other matching symbols into review.
   */
  onFindSimilar?: (candidateId: string) => void;
  findSimilarBusy?: boolean;
  /**
   * Search the WHOLE drawing (every page) for symbols matching an
   * already-CONFIRMED one — a validated mark is a trustworthy template, so
   * this scans further than the pre-confirm "Nájsť podobné" (current page
   * only). Undefined hides the action on confirmed rows.
   */
  onFindSimilarConfirmed?: (candidateId: string) => void;
  /**
   * "Čo je táto značka?" — ask AI vision to identify the symbol under one
   * mark (name + type), for plans without a legend. Undefined hides the
   * action (feature flag off / no permission).
   */
  onIdentifySymbol?: (candidateId: string) => void;
  identifyBusy?: boolean;
  /**
   * Rapid category marking — the operator's primary counting workflow:
   * pick (or create) a position, then click-count its symbols on the plan.
   * `activeCategoryKey` marks which category is currently being clicked.
   */
  activeCategoryKey?: string | null;
  onStartCategoryMarking?: (category: {
    key: string;
    label: string;
    symbolType: string;
    /** When set, each confirmed mark syncs qty/price into the quote draft. */
    catalog?: {
      productId: string;
      unitPrice: number;
      unit: string;
      note?: string;
      imageUrl?: string | null;
      quoteCategory?: "material" | "work";
    };
  }) => void;
  /** Optional image URLs keyed by category key (from catalog bindings). */
  categoryImageUrls?: Record<string, string>;
  /** Optional unit prices keyed by category key (catalog pick / Doplniť cenu). */
  categoryPrices?: Record<string, { unitPrice: number; unit: string }>;
  onStopCategoryMarking?: () => void;
  /**
   * Categories whose marks currently glow on the plan. The highlighter
   * button toggles each category independently, so the operator can light
   * up exactly the positions they're checking (one, several, or all).
   */
  highlightedCategoryKeys?: string[];
  onHighlightCategory?: (key: string) => void;
  /** Replace the highlighted set at once — "Zvýrazniť všetky" / clear all. */
  onSetHighlightedCategories?: (keys: string[]) => void;
  /**
   * Move ONE confirmed mark into a different position/category — the fix
   * for "this socket is actually the double-socket type". Creates the
   * target position when it doesn't exist yet.
   */
  onMoveConfirmedToCategory?: (candidateId: string, label: string) => Promise<void>;
  /**
   * Rename a whole position (relabels every mark; merges on name clash).
   * Optional `catalog` replaces the linked product (price, image, quote sync).
   */
  onRenameCategory?: (
    categoryKey: string,
    newLabel: string,
    catalog?: {
      productId: string;
      unitPrice: number;
      unit: string;
      note?: string;
      imageUrl?: string | null;
      quoteCategory?: "material" | "work";
    }
  ) => Promise<void>;
  /** Delete every confirmed mark in a position/category (and sync quote). */
  onDeleteCategory?: (categoryKey: string) => Promise<void>;
  /**
   * Apply a looked-up unit price into the project quote draft for this article.
   * Undefined hides the "Doplniť cenu" action.
   */
  onApplyPrice?: (input: {
    name: string;
    unitPrice: number;
    note?: string;
  }) => Promise<void>;
  /** Called after the operator picks a new color for a mark category (plan refresh). */
  onCategoryColorChange?: () => void;
  /**
   * Persist / sync a category comment (e.g. into the quote line note).
   * Local storage is always updated; this hook is optional extra sync.
   */
  onCategoryNoteChange?: (categoryKey: string, note: string) => void;
  /**
   * Persist the panel's view state (open sections, expanded categories)
   * under this key — pass the canonical drawingId so the quote flow and the
   * project/documents flow show the SAME panel for the same PDF instead of
   * each starting from its own defaults.
   */
  persistKey?: string | null;
};

type PanelViewState = {
  showConfirmed: boolean;
  showRejected: boolean;
  /** "Výkaz položiek" section — optional for backward-compatible storage. */
  showItems?: boolean;
  expandedCategories: string[];
  collapsedGroups: string[];
};

function loadPanelViewState(key: string | null | undefined): PanelViewState | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`takeoff.reviewPanel.${key}`);
    return raw ? (JSON.parse(raw) as PanelViewState) : null;
  } catch {
    return null;
  }
}

function savePanelViewState(key: string | null | undefined, state: PanelViewState) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`takeoff.reviewPanel.${key}`, JSON.stringify(state));
  } catch {
    /* storage full/blocked — view state is a nice-to-have */
  }
}

export function SymbolCandidateReviewPanel({
  candidates,
  selectedId,
  onSelect,
  takeoffItems,
  busy = false,
  onConfirm,
  onReject,
  onChangeType,
  onChangeConfirmedType,
  onMarkUnknown,
  onConfirmAllProbable,
  onDeleteCandidate,
  onDeleteConfirmed,
  onDeleteAllRejected,
  onDeleteAllCandidates,
  onEvidenceClick,
  evidenceThumbs = null,
  onEvidenceThumbClick,
  canReview = true,
  onFindSimilar,
  findSimilarBusy = false,
  onFindSimilarConfirmed,
  onIdentifySymbol,
  identifyBusy = false,
  activeCategoryKey = null,
  onStartCategoryMarking,
  onStopCategoryMarking,
  highlightedCategoryKeys = [],
  onHighlightCategory,
  onSetHighlightedCategories,
  onMoveConfirmedToCategory,
  onRenameCategory,
  onDeleteCategory,
  onApplyPrice,
  onCategoryColorChange,
  onCategoryNoteChange,
  categoryImageUrls = {},
  categoryPrices = {},
  persistKey = null,
}: Props) {
  const { t } = useI18n();
  // View state is restored per drawing (persistKey) so the SAME PDF shows
  // the SAME panel whether it's opened from the quote or from Documents.
  const [initialViewState] = useState(() => loadPanelViewState(persistKey));
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [colorRevision, setColorRevision] = useState(0);
  const [catalogImageByKey, setCatalogImageByKey] = useState<Record<string, string>>(
    {}
  );
  const [imagePreview, setImagePreview] = useState<{
    url: string;
    label: string;
  } | null>(null);
  /** Enlarged crop preview while hovering a candidate thumbnail. */
  const [cropHover, setCropHover] = useState<{
    url: string;
    label: string;
    left: number;
    top: number;
  } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(initialViewState?.collapsedGroups ?? [])
  );
  // Grouped categories make the confirmed section compact — the operator's
  // primary working list, so it starts open.
  const [showConfirmed, setShowConfirmed] = useState(
    initialViewState?.showConfirmed ?? true
  );
  const [showRejected, setShowRejected] = useState(
    initialViewState?.showRejected ?? false
  );
  const [showItems, setShowItems] = useState(initialViewState?.showItems ?? true);
  // Individual marks inside a category — collapsed by default ("Svetlo × 6"
  // is the useful row; 6 identical child rows are detail-on-demand).
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(initialViewState?.expandedCategories ?? [])
  );
  useEffect(() => {
    savePanelViewState(persistKey, {
      showConfirmed,
      showRejected,
      showItems,
      expandedCategories: [...expandedCategories],
      collapsedGroups: [...collapsed],
    });
  }, [persistKey, showConfirmed, showRejected, showItems, expandedCategories, collapsed]);
  /** Supplier catalog with product photos (BUCO). */
  const [electricalCatalogOpen, setElectricalCatalogOpen] = useState(false);
  /** Own price list — products + work items. */
  const [companyCatalogOpen, setCompanyCatalogOpen] = useState(false);
  /** `new` = start marking; `edit` = replace product on an existing category. */
  const [catalogPickerPurpose, setCatalogPickerPurpose] = useState<"new" | "edit">(
    "new"
  );
  const [priceLookupFor, setPriceLookupFor] = useState<string | null>(null);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryType, setNewCategoryType] = useState("generic");
  // "Presunúť do inej položky" — one mark; "Upraviť" — whole category.
  const [moveFor, setMoveFor] = useState<AnalyzeRegionCandidateDto | null>(null);
  const [moveNewLabel, setMoveNewLabel] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [renameFor, setRenameFor] = useState<{ key: string; label: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<{ key: string; label: string } | null>(null);
  const [noteValue, setNoteValue] = useState("");
  /** Bump to re-read localStorage notes after save. */
  const [noteRevision, setNoteRevision] = useState(0);
  const [deleteCategoryFor, setDeleteCategoryFor] = useState<{
    key: string;
    label: string;
    count: number;
  } | null>(null);
  const [deleteCategoryBusy, setDeleteCategoryBusy] = useState(false);
  const [changeTypeFor, setChangeTypeFor] = useState<AnalyzeRegionCandidateDto | null>(
    null
  );
  const [changeTypeValue, setChangeTypeValue] = useState("socket");
  const [deleteConfirmedFor, setDeleteConfirmedFor] = useState<AnalyzeRegionCandidateDto | null>(
    null
  );
  const [deletingAllRejected, setDeletingAllRejected] = useState(false);
  const [deletingAllCandidates, setDeletingAllCandidates] = useState(false);
  const [deleteAllCandidatesConfirmOpen, setDeleteAllCandidatesConfirmOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Clicking a confirmed/rejected marker on the map selects it here too —
  // auto-expand the section AND the category it lives in so the row isn't
  // silently hidden.
  const selectedCandidate = candidates.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    if (selectedCandidate?.status === "confirmed") {
      setShowConfirmed(true);
      const key = categoryKeyForLabel(categoryLabelForCandidate(selectedCandidate));
      setExpandedCategories((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    }
    if (selectedCandidate?.status === "rejected") setShowRejected(true);
  }, [selectedCandidate]);

  // Selecting a mark on the PLAN must also make its row obvious HERE — same
  // glow color as the plan overlay, plus auto-scroll so the row is never
  // just off-screen below/above the visible part of a long list.
  useEffect(() => {
    if (!selectedId) return;
    const list = listRef.current;
    const row = list?.querySelector(`[data-row-id="${selectedId}"]`);
    if (!list || !(row instanceof HTMLElement)) return;
    // Scroll ONLY the panel's own list container. scrollIntoView would also
    // scroll every ancestor including the window — which yanked the whole
    // screen whenever a mark was placed/selected on the plan.
    const rowRect = row.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (rowRect.top >= listRect.top && rowRect.bottom <= listRect.bottom) return;
    list.scrollTo({
      top:
        list.scrollTop +
        (rowRect.top - listRect.top) -
        list.clientHeight / 2 +
        rowRect.height / 2,
      behavior: "smooth",
    });
  }, [selectedId]);

  const groups = useMemo(() => groupCandidatesForReview(candidates), [candidates]);
  const activeCount = groups.reduce((n, g) => n + g.candidates.length, 0);
  const confirmedCandidates = useMemo(
    () => candidates.filter((c) => c.status === "confirmed"),
    [candidates]
  );
  const confirmedCategories = useMemo(
    () => groupConfirmedByCategory(confirmedCandidates),
    // colorRevision: re-read categoryColorForKey after operator override
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirmedCandidates, colorRevision]
  );

  /** Keys already used as positions — new "+ Nová položka" must not collide. */
  const existingCategoryKeys = useMemo(() => {
    const keys = confirmedCategories.map((c) => c.key);
    if (activeCategoryKey) keys.push(activeCategoryKey);
    return keys;
  }, [confirmedCategories, activeCategoryKey]);

  const startNewPositionCategory = (params: {
    label: string;
    symbolType: string;
    catalog?: {
      productId: string;
      unitPrice: number;
      unit: string;
      note?: string;
      imageUrl?: string | null;
      quoteCategory?: "material" | "work";
    };
  }) => {
    const label = uniquifyCategoryLabel(params.label, existingCategoryKeys);
    onStartCategoryMarking?.({
      key: categoryKeyForLabel(label),
      label,
      symbolType: params.symbolType,
      ...(params.catalog ? { catalog: params.catalog } : {}),
    });
  };

  // Resolve product photos for confirmed positions (catalog name match).
  useEffect(() => {
    if (confirmedCategories.length === 0) return;
    let cancelled = false;
    void loadElectricalCatalog()
      .then(({ products }) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of products) {
          const url = resolveCatalogProductImageUrl(p);
          if (!url) continue;
          const key = categoryKeyForLabel(p.name);
          if (!map[key]) map[key] = url;
        }
        setCatalogImageByKey(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [confirmedCategories.length]);

  const imageUrlForCategory = (key: string, label: string): string | null => {
    const fromProp = categoryImageUrls[key]?.trim();
    if (fromProp) return fromProp;
    const fromCatalog = catalogImageByKey[key]?.trim();
    if (fromCatalog) return fromCatalog;
    // Loose match — label may differ slightly from catalog name casing/spacing.
    const loose = categoryKeyForLabel(label);
    return catalogImageByKey[loose]?.trim() || null;
  };
  const rejectedCandidates = useMemo(
    () => candidates.filter((c) => c.status === "rejected"),
    [candidates]
  );
  const probableCount = candidates.filter(
    (c) =>
      c.status !== "rejected" &&
      c.status !== "confirmed" &&
      (c.status === "probable" || c.confidence >= 0.55)
  ).length;

  // Everything that belongs in the quote mirror — symbols, exported cable
  // routes, and manual takeoff rows. Legend-only stays separate (not quote).
  const detectionItems = takeoffItems.filter(
    (i) =>
      i.status !== "excluded" &&
      i.sourceOfQuantity !== "legend_only" &&
      i.name.trim() !== ""
  );
  const legendItems = takeoffItems.filter((i) => i.sourceOfQuantity === "legend_only");

  if (
    activeCount === 0 &&
    confirmedCandidates.length === 0 &&
    rejectedCandidates.length === 0 &&
    detectionItems.length === 0 &&
    legendItems.length === 0 &&
    // With category marking available, the "empty" state still needs the
    // primary CTA — the operator starts by creating their first position.
    !(canReview && onStartCategoryMarking)
  ) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
        {t("takeoff.review.empty")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="symbol-candidate-review">
      {/* Section 1 — Kandidáti na kontrolu */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-foreground">
          {t("takeoff.review.sectionCandidates")}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t("takeoff.review.activeCount", { count: activeCount })}
        </span>
        <span className="basis-full text-[10px] text-muted-foreground">
          {t("takeoff.review.sectionCandidatesHint")}
        </span>
        {canReview && probableCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs"
            disabled={busy}
            data-testid="confirm-all-probable"
            onClick={() => void onConfirmAllProbable()}
          >
            <CheckCheck className="mr-1 size-3.5" />
            {t("takeoff.review.confirmAllProbable")}
          </Button>
        ) : null}
        {canReview && onDeleteAllCandidates && activeCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              "h-7 text-xs text-destructive hover:text-destructive",
              probableCount === 0 && "ml-auto"
            )}
            disabled={busy || deletingAllCandidates}
            data-testid="delete-all-candidates"
            onClick={() => setDeleteAllCandidatesConfirmOpen(true)}
          >
            <Trash2 className="mr-1 size-3.5" />
            {deletingAllCandidates
              ? t("common.loading")
              : t("takeoff.review.deleteAllCandidates")}
          </Button>
        ) : null}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-auto pr-0.5">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.id);
          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-muted/50"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                {isCollapsed ? (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                )}
                <span>{t(group.labelKey)}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {group.candidates.length}
                </span>
              </button>
              {!isCollapsed
                ? group.candidates.map((c) => {
                    const selected = c.id === selectedId;
                    const accent = colorLayerAccent(c.color_layer);
                    const label =
                      c.label_suggestions[0]?.label ??
                      defaultSymbolTypeForCandidate(c);
                    return (
                      <div
                        key={c.id}
                        data-row-id={c.id}
                        className="border-t border-border/70 px-2.5 py-2"
                        style={
                          selected
                            ? {
                                backgroundColor: `${SELECTED_HIGHLIGHT_COLOR}26`,
                                boxShadow: `inset 0 0 0 2px ${SELECTED_HIGHLIGHT_COLOR}`,
                              }
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          className="flex w-full items-start gap-2 text-left"
                          onClick={() => onSelect(c.id)}
                        >
                          {c.preview_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.preview_image_url}
                              alt={label}
                              loading="lazy"
                              data-testid="candidate-preview-thumb"
                              title={t("takeoff.review.previewHoverHint")}
                              className="mt-0.5 size-10 shrink-0 rounded border border-border object-contain bg-white"
                              style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
                              onMouseEnter={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                const width = 220;
                                const height = 220;
                                const pad = 8;
                                let left = r.right + pad;
                                if (left + width > window.innerWidth - pad) {
                                  left = Math.max(pad, r.left - width - pad);
                                }
                                let top = r.top;
                                if (top + height > window.innerHeight - pad) {
                                  top = Math.max(pad, window.innerHeight - height - pad);
                                }
                                setCropHover({
                                  url: c.preview_image_url!,
                                  label,
                                  left,
                                  top,
                                });
                              }}
                              onMouseLeave={() => setCropHover(null)}
                            />
                          ) : (
                            <span
                              className="mt-0.5 size-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: accent }}
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1">
                              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                                {label}
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 rounded px-1 py-px text-[9px] font-medium",
                                  c.nearby_text
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground"
                                )}
                                data-testid={
                                  c.nearby_text ? "ocr-text-badge" : "ocr-no-text-badge"
                                }
                                title={c.nearby_text ?? undefined}
                              >
                                {c.nearby_text
                                  ? t("takeoff.ocr.hasText")
                                  : t("takeoff.ocr.noText")}
                              </span>
                            </span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {Math.round(c.confidence * 100)}% · {t(sourceLabelKey(c.source))} ·{" "}
                              {t(statusLabelKey(c.status))}
                              {c.nearby_text ? ` · ${c.nearby_text}` : ""}
                            </span>
                          </span>
                        </button>
                        {canReview ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            data-testid="candidate-confirm"
                            onClick={() =>
                              void onConfirm(c.id, defaultSymbolTypeForCandidate(c))
                            }
                          >
                            <Check className="mr-0.5 size-3" />
                            {t("takeoff.review.confirm")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            data-testid="candidate-reject"
                            onClick={() => void onReject(c.id)}
                          >
                            <X className="mr-0.5 size-3" />
                            {t("takeoff.review.reject")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            onClick={() => {
                              setChangeTypeFor(c);
                              setChangeTypeValue(defaultSymbolTypeForCandidate(c));
                            }}
                          >
                            <Pencil className="mr-0.5 size-3" />
                            {t("takeoff.review.changeType")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            disabled={busy}
                            onClick={() => void onMarkUnknown(c.id)}
                          >
                            <HelpCircle className="mr-0.5 size-3" />
                            {t("takeoff.review.markUnknown")}
                          </Button>
                          {onFindSimilar ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              disabled={busy || findSimilarBusy}
                              data-testid="candidate-find-similar"
                              onClick={() => onFindSimilar(c.id)}
                            >
                              <Copy className="mr-0.5 size-3" />
                              {findSimilarBusy
                                ? t("takeoff.action.findSimilarBusy")
                                : t("takeoff.action.findSimilar")}
                            </Button>
                          ) : null}
                          {onIdentifySymbol ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px]"
                              disabled={busy || identifyBusy}
                              data-testid="candidate-identify-ai"
                              title={t("takeoff.identify.hint")}
                              onClick={() => onIdentifySymbol(c.id)}
                            >
                              <Sparkles className="mr-0.5 size-3" />
                              {t("takeoff.identify.action")}
                            </Button>
                          ) : null}
                          {onDeleteCandidate ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                              disabled={busy}
                              data-testid="candidate-delete"
                              onClick={() => void onDeleteCandidate(c.id)}
                            >
                              <Trash2 className="mr-0.5 size-3" />
                              {t("takeoff.review.delete")}
                            </Button>
                          ) : null}
                        </div>
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}

        {/* Section 2 — Potvrdené značky, grouped into operator categories
            (positions). One row per position: color chip + label + piece
            count + "Doznačiť" to click-count more of the same symbol. */}
        {confirmedCandidates.length > 0 || (canReview && onStartCategoryMarking) ? (
          <div
            className="overflow-hidden rounded-lg border border-emerald-600/30 bg-card"
            data-testid="section-confirmed"
          >
            <div className="flex w-full flex-wrap items-center gap-1.5 px-2.5 py-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 basis-[8rem] items-center gap-2 text-left text-xs font-semibold text-foreground hover:bg-muted/50"
                onClick={() => setShowConfirmed((v) => !v)}
              >
                {showConfirmed ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate">
                  {t("takeoff.review.sectionConfirmed")}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {confirmedCandidates.length}
                </span>
              </button>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
                {onSetHighlightedCategories && confirmedCategories.length > 0 ? (
                  (() => {
                    const allOn =
                      highlightedCategoryKeys.length > 0 &&
                      confirmedCategories.every((c) =>
                        highlightedCategoryKeys.includes(c.key)
                      );
                    return (
                      <Button
                        type="button"
                        size="sm"
                        variant={allOn ? "default" : "outline"}
                        className="h-6 shrink-0 px-1.5 text-[10px]"
                        data-testid="highlight-all-categories"
                        title={t("takeoff.category.highlightAllHint")}
                        onClick={() =>
                          onSetHighlightedCategories(
                            allOn ? [] : confirmedCategories.map((c) => c.key)
                          )
                        }
                      >
                        <Highlighter className="mr-0.5 size-3" />
                        {allOn
                          ? t("takeoff.category.highlightAllOff")
                          : t("takeoff.category.highlightAll")}
                      </Button>
                    );
                  })()
                ) : null}
                {canReview && onStartCategoryMarking ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-1.5 text-[10px]"
                    disabled={busy}
                    data-testid="new-category"
                    onClick={() => {
                      setCatalogPickerPurpose("new");
                      setElectricalCatalogOpen(true);
                    }}
                  >
                    <Plus className="mr-0.5 size-3" />
                    {t("takeoff.category.new")}
                  </Button>
                ) : null}
              </div>
            </div>
            {showConfirmed && confirmedCategories.length === 0 ? (
              <p className="border-t border-border/70 px-2.5 py-2 text-[11px] text-muted-foreground">
                {t("takeoff.category.emptyHint")}
              </p>
            ) : null}
            {showConfirmed
              ? confirmedCategories.map((cat) => {
                  const expanded = expandedCategories.has(cat.key);
                  const isActive = activeCategoryKey === cat.key;
                  const isHighlighted = highlightedCategoryKeys.includes(cat.key);
                  return (
                    <div key={cat.key} className="border-t border-border/70">
                      {/* Stacked row — stays readable when the side panel is narrow. */}
                      <div
                        className={cn(
                          "flex flex-col gap-1.5 px-2.5 py-2 text-xs",
                          isActive && "bg-primary/10"
                        )}
                        data-testid="category-row"
                      >
                        <div className="flex min-w-0 items-start gap-1.5">
                          <button
                            type="button"
                            className="mt-0.5 flex shrink-0 items-center text-left hover:opacity-80"
                            onClick={() =>
                              setExpandedCategories((prev) => {
                                const next = new Set(prev);
                                if (next.has(cat.key)) next.delete(cat.key);
                                else next.add(cat.key);
                                return next;
                              })
                            }
                            title={t("takeoff.category.expandHint")}
                          >
                            {expanded ? (
                              <ChevronDown className="size-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 text-muted-foreground" />
                            )}
                          </button>
                          {/* Color chip opens RAL dialog (portal) — not clipped by panel overflow. */}
                          <button
                            type="button"
                            className={cn(
                              "mt-1 size-4 shrink-0 rounded-full border transition-shadow",
                              isHighlighted
                                ? "border-transparent"
                                : "border-black/15 opacity-90 hover:opacity-100",
                              onCategoryColorChange || onHighlightCategory
                                ? "cursor-pointer"
                                : "cursor-default"
                            )}
                            style={{
                              backgroundColor: cat.color,
                              boxShadow: isHighlighted
                                ? `0 0 0 2px white, 0 0 0 4px ${cat.color}`
                                : undefined,
                            }}
                            data-testid="category-color-toggle"
                            title={
                              onCategoryColorChange
                                ? t("takeoff.category.changeColor")
                                : t("takeoff.category.highlight")
                            }
                            aria-haspopup="dialog"
                            onClick={() => {
                              if (onCategoryColorChange) {
                                setColorPickerFor(cat.key);
                                return;
                              }
                              onHighlightCategory?.(cat.key);
                            }}
                          />
                          {(() => {
                            const imgUrl = imageUrlForCategory(cat.key, cat.label);
                            if (!imgUrl) return null;
                            return (
                              <button
                                type="button"
                                className="size-8 shrink-0 overflow-hidden rounded-md border border-border bg-white dark:bg-card"
                                data-testid="category-product-image"
                                title={t("takeoff.category.productImageHint")}
                                onClick={() =>
                                  setImagePreview({ url: imgUrl, label: cat.label })
                                }
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imgUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="size-full object-contain"
                                />
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left hover:opacity-80"
                            onClick={() =>
                              setExpandedCategories((prev) => {
                                const next = new Set(prev);
                                if (next.has(cat.key)) next.delete(cat.key);
                                else next.add(cat.key);
                                return next;
                              })
                            }
                            title={t("takeoff.category.expandHint")}
                          >
                            <span className="line-clamp-2 font-medium leading-snug text-foreground">
                              {cat.label}
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {onHighlightCategory ? (
                              <button
                                type="button"
                                className={cn(
                                  "rounded p-1",
                                  !isHighlighted &&
                                    "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                )}
                                style={
                                  isHighlighted
                                    ? {
                                        color: cat.color,
                                        backgroundColor: `${cat.color}22`,
                                      }
                                    : undefined
                                }
                                data-testid="category-highlight"
                                title={t("takeoff.category.highlight")}
                                onClick={() => onHighlightCategory(cat.key)}
                              >
                                <Highlighter className="size-3.5" />
                              </button>
                            ) : null}
                            {canReview && onRenameCategory ? (
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                disabled={busy || renameBusy}
                                data-testid="category-rename"
                                title={t("takeoff.category.edit")}
                                onClick={() => {
                                  setRenameValue(cat.label);
                                  setRenameFor({ key: cat.key, label: cat.label });
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            ) : null}
                            {canReview ? (
                              (() => {
                                // noteRevision forces re-read after save in this session.
                                void noteRevision;
                                const hasNote = Boolean(categoryNoteForKey(cat.key));
                                return (
                                  <button
                                    type="button"
                                    className={cn(
                                      "rounded p-1",
                                      hasNote
                                        ? "text-[#e06737] hover:bg-[#e06737]/10"
                                        : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                    )}
                                    disabled={busy}
                                    data-testid="category-note"
                                    title={
                                      hasNote
                                        ? t("takeoff.category.noteEditHint")
                                        : t("takeoff.category.noteAddHint")
                                    }
                                    onClick={() => {
                                      setNoteValue(categoryNoteForKey(cat.key));
                                      setNoteFor({ key: cat.key, label: cat.label });
                                    }}
                                  >
                                    <MessageSquare
                                      className={cn(
                                        "size-3.5",
                                        hasNote && "fill-current"
                                      )}
                                    />
                                  </button>
                                );
                              })()
                            ) : null}
                            {canReview && onDeleteCategory ? (
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                disabled={busy || deleteCategoryBusy}
                                data-testid="category-delete"
                                title={t("takeoff.category.delete")}
                                onClick={() =>
                                  setDeleteCategoryFor({
                                    key: cat.key,
                                    label: cat.label,
                                    count: cat.candidates.length,
                                  })
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-5">
                          <span className="tabular-nums font-semibold text-foreground">
                            {t("takeoff.category.pieces", {
                              count: cat.candidates.length,
                            })}
                          </span>
                          {onApplyPrice ? (
                            <button
                              type="button"
                              className={cn(
                                "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] tabular-nums font-medium",
                                categoryPrices[cat.key]
                                  ? "text-[#e06737] hover:bg-[#e06737]/10"
                                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                              )}
                              disabled={busy}
                              data-testid="category-add-price"
                              title={t("takeoff.priceLookup.buttonHint")}
                              onClick={() => setPriceLookupFor(cat.label)}
                            >
                              <CircleDollarSign className="size-3.5 shrink-0" />
                              {categoryPrices[cat.key] ? (
                                <span data-testid="category-unit-price">
                                  {formatMoney(
                                    categoryPrices[cat.key]!.unitPrice,
                                    "EUR"
                                  )}
                                  <span className="font-normal text-muted-foreground">
                                    /
                                    {(() => {
                                      const u = categoryPrices[cat.key]!.unit;
                                      const key = `materials.unit.${u}`;
                                      const labeled = t(key);
                                      return labeled === key ? u : labeled;
                                    })()}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-[10px]">
                                  {t("takeoff.priceLookup.buttonShort")}
                                </span>
                              )}
                            </button>
                          ) : categoryPrices[cat.key] ? (
                            <span
                              className="inline-flex items-center gap-1 tabular-nums text-[11px] font-medium text-[#e06737]"
                              data-testid="category-unit-price"
                              title={t("takeoff.priceLookup.unitPriceHint")}
                            >
                              <CircleDollarSign className="size-3.5 shrink-0" />
                              {formatMoney(
                                categoryPrices[cat.key]!.unitPrice,
                                "EUR"
                              )}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-1 pl-5">
                          {canReview && onStartCategoryMarking ? (
                            isActive ? (
                              <Button
                                type="button"
                                size="sm"
                                className="h-6 px-1.5 text-[10px]"
                                data-testid="category-stop-marking"
                                onClick={() => onStopCategoryMarking?.()}
                              >
                                {t("takeoff.category.stopMarking")}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-1.5 text-[10px]"
                                disabled={busy}
                                data-testid="category-add-marks"
                                title={t("takeoff.category.addMarksHint")}
                                onClick={() =>
                                  onStartCategoryMarking({
                                    key: cat.key,
                                    label: cat.label,
                                    symbolType: cat.symbolType,
                                  })
                                }
                              >
                                <MousePointerClick className="mr-0.5 size-3" />
                                {t("takeoff.category.addMarks")}
                              </Button>
                            )
                          ) : null}
                          {/* Find-similar only when NOT actively click-counting —
                              sitting next to Doznačiť/Ukončiť caused accidental
                              whole-drawing searches while placing marks. */}
                          {canReview &&
                          onFindSimilarConfirmed &&
                          cat.candidates[0] &&
                          !isActive ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-6 px-1.5 text-[10px]"
                              disabled={busy || findSimilarBusy}
                              data-testid="category-find-similar"
                              title={t("takeoff.review.findSimilarConfirmedHint")}
                              onClick={() =>
                                onFindSimilarConfirmed(cat.candidates[0]!.id)
                              }
                            >
                              <Copy className="mr-0.5 size-3" />
                              {findSimilarBusy
                                ? t("takeoff.action.findSimilarBusy")
                                : t("takeoff.action.findSimilar")}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {expanded
                        ? cat.candidates.map((c) => (
                            <div
                              key={c.id}
                              data-row-id={c.id}
                              className="flex w-full items-center gap-2 border-t border-border/40 py-1.5 pl-8 pr-2.5 text-xs hover:bg-muted/50"
                              style={
                                c.id === selectedId
                                  ? {
                                      backgroundColor: `${SELECTED_HIGHLIGHT_COLOR}26`,
                                      boxShadow: `inset 0 0 0 2px ${SELECTED_HIGHLIGHT_COLOR}`,
                                    }
                                  : undefined
                              }
                            >
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                onClick={() => onSelect(c.id)}
                                title={t("takeoff.review.sectionCandidatesHint")}
                              >
                                <Check className="size-3 shrink-0 text-emerald-600" />
                                <span className="min-w-0 flex-1 truncate text-foreground">
                                  {t("takeoff.category.pageShort", {
                                    page: c.page_number ?? 1,
                                  })}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {t(sourceLabelKey(c.source))}
                                </span>
                              </button>
                              {canReview && onMoveConfirmedToCategory ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  disabled={busy || moveBusy}
                                  data-testid="confirmed-move-category"
                                  title={t("takeoff.category.moveMark")}
                                  onClick={() => {
                                    setMoveNewLabel("");
                                    setMoveFor(c);
                                  }}
                                >
                                  <FolderInput className="size-3.5" />
                                </button>
                              ) : null}
                              {canReview && onChangeConfirmedType ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  disabled={busy}
                                  data-testid="confirmed-change-type"
                                  title={t("takeoff.review.changeType")}
                                  onClick={() => {
                                    setChangeTypeValue(defaultSymbolTypeForCandidate(c));
                                    setChangeTypeFor(c);
                                  }}
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              ) : null}
                              {canReview && onFindSimilarConfirmed ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  disabled={busy || findSimilarBusy}
                                  data-testid="confirmed-find-similar"
                                  title={t("takeoff.review.findSimilarConfirmedHint")}
                                  onClick={() => onFindSimilarConfirmed(c.id)}
                                >
                                  <Copy className="size-3.5" />
                                </button>
                              ) : null}
                              {onIdentifySymbol ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                  disabled={busy || identifyBusy}
                                  data-testid="confirmed-identify-ai"
                                  title={t("takeoff.identify.hint")}
                                  onClick={() => onIdentifySymbol(c.id)}
                                >
                                  <Sparkles className="size-3.5" />
                                </button>
                              ) : null}
                              {canReview && onDeleteConfirmed ? (
                                <button
                                  type="button"
                                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                  disabled={busy}
                                  data-testid="confirmed-delete"
                                  title={t("takeoff.review.delete")}
                                  onClick={() => setDeleteConfirmedFor(c)}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              ) : null}
                            </div>
                          ))
                        : null}
                    </div>
                  );
                })
              : null}
          </div>
        ) : null}

        {/* Section 3 — Odmietnuté / skryté */}
        {rejectedCandidates.length > 0 ? (
          <div
            className="overflow-hidden rounded-lg border border-border bg-card"
            data-testid="section-rejected"
          >
            <div className="flex w-full items-center gap-2 px-2.5 py-1.5">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={() => setShowRejected((v) => !v)}
              >
                {showRejected ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
                <span>{t("takeoff.review.sectionRejected")}</span>
                <span className="tabular-nums">{rejectedCandidates.length}</span>
              </button>
              {canReview && onDeleteAllRejected ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-1.5 text-[10px] text-destructive hover:text-destructive"
                  disabled={busy || deletingAllRejected}
                  data-testid="delete-all-rejected"
                  onClick={async () => {
                    setDeletingAllRejected(true);
                    try {
                      await onDeleteAllRejected();
                    } finally {
                      setDeletingAllRejected(false);
                    }
                  }}
                >
                  <Trash2 className="mr-0.5 size-3" />
                  {deletingAllRejected
                    ? t("common.loading")
                    : t("takeoff.review.deleteAllRejected")}
                </Button>
              ) : null}
            </div>
            {showRejected
              ? rejectedCandidates.map((c) => (
                  <div
                    key={c.id}
                    data-row-id={c.id}
                    className="flex items-center gap-2 border-t border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground"
                    style={
                      c.id === selectedId
                        ? {
                            backgroundColor: `${SELECTED_HIGHLIGHT_COLOR}26`,
                            boxShadow: `inset 0 0 0 2px ${SELECTED_HIGHLIGHT_COLOR}`,
                          }
                        : undefined
                    }
                  >
                    <X className="size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {c.label_suggestions[0]?.label ?? defaultSymbolTypeForCandidate(c)}
                    </span>
                    <span className="shrink-0 text-[10px]">{t(sourceLabelKey(c.source))}</span>
                    {onDeleteCandidate ? (
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        data-testid="rejected-delete"
                        title={t("takeoff.review.delete")}
                        onClick={() => void onDeleteCandidate(c.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </div>

      {/* Section 4 — Výkaz položiek (evidence links). Collapsible + capped
          height with internal scroll so a long list never bleeds over the
          panels rendered below (e.g. Káble a trasy). */}
      {detectionItems.length > 0 || legendItems.length > 0 ? (
        <div
          className="flex max-h-[420px] min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
          data-testid="section-items"
        >
          <button
            type="button"
            className="flex w-full shrink-0 items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-muted/50"
            onClick={() => setShowItems((v) => !v)}
          >
            {showItems ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
            <span>{t("takeoff.review.sectionItems")}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {detectionItems.length + legendItems.length}
            </span>
          </button>
          {showItems ? (
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto border-t border-border/70 p-2.5 pt-1.5">
          <p className="mb-1 text-[10px] text-muted-foreground">
            {t("takeoff.review.sectionItemsHint")}
            {detectionItems.length + legendItems.length > 6
              ? ` · ${t("takeoff.review.sectionItemsScrollHint")}`
              : ""}
          </p>
          <div className="divide-y divide-border/60">
            {detectionItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/60"
                data-testid="takeoff-evidence-link"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  title={t("takeoff.review.evidenceThumbHint")}
                  onClick={() => onEvidenceClick(item.id)}
                >
                  <MapPin className="size-3 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                  <span className="shrink-0 tabular-nums font-semibold text-foreground">
                    {item.quantity} {item.unit}
                  </span>
                  {item.sourceOfQuantity === "route_calculation" ? (
                    <span className="shrink-0 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">
                      {t("takeoff.review.sourceCable")}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-primary">
                      {t("takeoff.review.evidenceCount", { count: item.evidenceCount })}
                    </span>
                  )}
                </button>
                {onApplyPrice ? (
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    title={t("takeoff.priceLookup.buttonHint")}
                    data-testid="item-add-price"
                    onClick={() => setPriceLookupFor(item.name)}
                  >
                    <CircleDollarSign className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
            {legendItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {item.quantity} {item.unit}
                </span>
                <LegendOnlyBadge compact />
              </div>
            ))}
          </div>

          {/* Evidence thumbnails for the last clicked item — bbox focus still
              works without them (thumbnails are an optional enhancement). */}
          {evidenceThumbs && evidenceThumbs.thumbs.some((e) => e.url) ? (
            <div
              className="mt-1 border-t border-border/70 pt-1.5"
              data-testid="evidence-thumb-strip"
            >
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                {t("takeoff.review.evidenceFor", { name: evidenceThumbs.itemName })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {evidenceThumbs.thumbs
                  .filter((e) => e.url)
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="overflow-hidden rounded border border-border hover:ring-2 hover:ring-primary/40"
                      title={t("takeoff.review.evidenceThumbHint")}
                      onClick={() => onEvidenceThumbClick?.(e)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={e.url!}
                        alt={evidenceThumbs.itemName}
                        loading="lazy"
                        className="size-14 bg-white object-contain"
                      />
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={!!changeTypeFor}
        onOpenChange={(open) => {
          if (!open) setChangeTypeFor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.review.changeTypeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {t("takeoff.review.symbolType")}
            </Label>
            <Select
              value={changeTypeValue}
              onValueChange={(value) => {
                if (value) setChangeTypeValue(value);
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SYMBOL_TYPE_OPTIONS.map((opt) => {
                  const key =
                    opt === "led_strip"
                      ? "takeoff.type.ledStrip"
                      : opt === "distribution_board"
                        ? "takeoff.type.distributionBoard"
                        : opt === "unknown"
                          ? "takeoff.type.unknown"
                          : `takeoff.type.${opt}`;
                  return (
                    <SelectItem key={opt} value={opt}>
                      {t(key)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setChangeTypeFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy || !changeTypeFor}
              onClick={() => {
                if (!changeTypeFor) return;
                const apply =
                  changeTypeFor.status === "confirmed" && onChangeConfirmedType
                    ? onChangeConfirmedType
                    : onChangeType;
                void apply(changeTypeFor.id, changeTypeValue).then(() =>
                  setChangeTypeFor(null)
                );
              }}
            >
              {t("takeoff.review.applyType")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteConfirmedFor}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmedFor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.review.deleteConfirmedTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("takeoff.review.deleteConfirmedBody", {
              name:
                deleteConfirmedFor?.label_suggestions[0]?.label ??
                (deleteConfirmedFor ? defaultSymbolTypeForCandidate(deleteConfirmedFor) : ""),
            })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmedFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !deleteConfirmedFor}
              data-testid="confirm-delete-confirmed"
              onClick={() => {
                if (!deleteConfirmedFor || !onDeleteConfirmed) return;
                const id = deleteConfirmedFor.id;
                setDeleteConfirmedFor(null);
                void onDeleteConfirmed(id);
              }}
            >
              <Trash2 className="mr-1 size-3.5" />
              {t("takeoff.review.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteCategoryFor}
        onOpenChange={(open) => {
          if (!open && !deleteCategoryBusy) setDeleteCategoryFor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.category.deleteTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("takeoff.category.deleteBody", {
              name: deleteCategoryFor?.label ?? "",
              count: deleteCategoryFor?.count ?? 0,
            })}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteCategoryBusy}
              onClick={() => setDeleteCategoryFor(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || deleteCategoryBusy || !deleteCategoryFor}
              data-testid="confirm-delete-category"
              onClick={async () => {
                if (!deleteCategoryFor || !onDeleteCategory) return;
                setDeleteCategoryBusy(true);
                try {
                  await onDeleteCategory(deleteCategoryFor.key);
                  setDeleteCategoryFor(null);
                } finally {
                  setDeleteCategoryBusy(false);
                }
              }}
            >
              <Trash2 className="mr-1 size-3.5" />
              {t("takeoff.category.deleteAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteAllCandidatesConfirmOpen} onOpenChange={setDeleteAllCandidatesConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.review.deleteAllCandidatesTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("takeoff.review.deleteAllCandidatesBody", { count: activeCount })}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteAllCandidatesConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || deletingAllCandidates || !onDeleteAllCandidates}
              data-testid="confirm-delete-all-candidates"
              onClick={async () => {
                if (!onDeleteAllCandidates) return;
                setDeleteAllCandidatesConfirmOpen(false);
                setDeletingAllCandidates(true);
                try {
                  await onDeleteAllCandidates();
                } finally {
                  setDeletingAllCandidates(false);
                }
              }}
            >
              <Trash2 className="mr-1 size-3.5" />
              {t("takeoff.review.deleteAllCandidates")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Presunúť značku do inej položky — pick existing or type a new name. */}
      <Dialog
        open={!!moveFor}
        onOpenChange={(open) => {
          if (!open) setMoveFor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.category.moveMarkTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("takeoff.category.moveMarkHint")}
            </p>
            <div className="max-h-48 space-y-1 overflow-auto">
              {confirmedCategories
                .filter(
                  (cat) =>
                    !moveFor ||
                    cat.key !== categoryKeyForLabel(categoryLabelForCandidate(moveFor))
                )
                .map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted/60"
                    disabled={moveBusy}
                    data-testid="move-category-option"
                    onClick={async () => {
                      if (!moveFor || !onMoveConfirmedToCategory) return;
                      setMoveBusy(true);
                      try {
                        await onMoveConfirmedToCategory(moveFor.id, cat.label);
                        setMoveFor(null);
                      } finally {
                        setMoveBusy(false);
                      }
                    }}
                  >
                    <span
                      className="size-3 shrink-0 rounded-sm border border-black/10"
                      style={{ backgroundColor: cat.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {cat.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {t("takeoff.category.pieces", { count: cat.candidates.length })}
                    </span>
                  </button>
                ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="move-new-label" className="text-xs text-muted-foreground">
                {t("takeoff.category.moveMarkNewLabel")}
              </Label>
              <Input
                id="move-new-label"
                value={moveNewLabel}
                placeholder={t("takeoff.category.namePlaceholder")}
                onChange={(e) => setMoveNewLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoveFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={moveBusy || !moveNewLabel.trim()}
              data-testid="move-category-new"
              onClick={async () => {
                if (!moveFor || !onMoveConfirmedToCategory) return;
                setMoveBusy(true);
                try {
                  await onMoveConfirmedToCategory(moveFor.id, moveNewLabel.trim());
                  setMoveFor(null);
                } finally {
                  setMoveBusy(false);
                }
              }}
            >
              <FolderInput className="mr-1 size-3.5" />
              {t("takeoff.category.moveMarkAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upraviť položku — premenovanie alebo výber iného komponentu z katalógu. */}
      <Dialog
        open={
          !!renameFor && !electricalCatalogOpen && !companyCatalogOpen
        }
        onOpenChange={(open) => {
          if (!open) setRenameFor(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.category.editTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("takeoff.category.editHint")}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              disabled={renameBusy || !onRenameCategory}
              data-testid="rename-category-pick-catalog"
              onClick={() => {
                setCatalogPickerPurpose("edit");
                setElectricalCatalogOpen(true);
              }}
            >
              <Library className="mr-2 size-3.5" />
              {t("takeoff.category.pickFromCatalog")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              disabled={renameBusy || !onRenameCategory}
              data-testid="rename-category-pick-own"
              onClick={() => {
                setCatalogPickerPurpose("edit");
                setCompanyCatalogOpen(true);
              }}
            >
              <Hammer className="mr-2 size-3.5" />
              {t("takeoff.category.pickFromOwnWorks")}
            </Button>
            <div className="space-y-1.5">
              <Label htmlFor="rename-category" className="text-xs text-muted-foreground">
                {t("takeoff.category.nameLabel")}
              </Label>
              <Input
                id="rename-category"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameFor(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={
                renameBusy ||
                !renameValue.trim() ||
                (renameFor
                  ? categoryKeyForLabel(renameValue) === renameFor.key
                  : true)
              }
              data-testid="rename-category-apply"
              onClick={async () => {
                if (!renameFor || !onRenameCategory) return;
                setRenameBusy(true);
                try {
                  await onRenameCategory(renameFor.key, renameValue.trim());
                  setRenameFor(null);
                } finally {
                  setRenameBusy(false);
                }
              }}
            >
              {t("takeoff.category.renameAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category comment — icon-only in the row; edit here so it takes no panel space. */}
      <Dialog
        open={!!noteFor}
        onOpenChange={(open) => {
          if (!open) setNoteFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-[#e06737]" />
              {t("takeoff.category.noteTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("takeoff.category.noteHint", {
                label: noteFor?.label ?? "",
              })}
            </p>
            <Textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder={t("takeoff.category.notePlaceholder")}
              rows={4}
              autoFocus
              data-testid="category-note-input"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={!noteValue.trim()}
              data-testid="category-note-clear"
              onClick={() => {
                if (!noteFor) return;
                setCategoryNoteOverride(noteFor.key, "");
                onCategoryNoteChange?.(noteFor.key, "");
                setNoteRevision((n) => n + 1);
                setNoteFor(null);
              }}
            >
              {t("takeoff.category.noteClear")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNoteFor(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                data-testid="category-note-save"
                onClick={() => {
                  if (!noteFor) return;
                  const next = noteValue.trim();
                  setCategoryNoteOverride(noteFor.key, next);
                  onCategoryNoteChange?.(noteFor.key, next);
                  setNoteRevision((n) => n + 1);
                  setNoteFor(null);
                }}
              >
                {t("common.save")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {onApplyPrice && priceLookupFor ? (
        <AiPriceLookupDialog
          open={Boolean(priceLookupFor)}
          productName={priceLookupFor}
          onOpenChange={(next) => {
            if (!next) setPriceLookupFor(null);
          }}
          onApply={async ({ productName, unitPrice, note }) => {
            await onApplyPrice({ name: productName, unitPrice, note });
            setPriceLookupFor(null);
          }}
        />
      ) : null}

      {onCategoryColorChange && colorPickerFor ? (
        <MarkColorPicker
          open
          color={
            confirmedCategories.find((c) => c.key === colorPickerFor)?.color ??
            "#3B82F6"
          }
          label={
            confirmedCategories.find((c) => c.key === colorPickerFor)?.label
          }
          onClose={() => setColorPickerFor(null)}
          onChange={(hex) => {
            setCategoryColorOverride(colorPickerFor, hex);
            setColorRevision((n) => n + 1);
            onCategoryColorChange();
          }}
          markerSize={{
            value: categoryMarkerScaleForKey(colorPickerFor),
            min: CATEGORY_MARKER_SCALE_MIN,
            max: CATEGORY_MARKER_SCALE_MAX,
            onChange: (scale) => {
              setCategoryMarkerScaleOverride(colorPickerFor, scale);
              setColorRevision((n) => n + 1);
              onCategoryColorChange();
            },
          }}
        />
      ) : null}

      {cropHover ? (
        <div
          className="pointer-events-none fixed z-[80] overflow-hidden rounded-lg border border-border bg-white p-2 shadow-xl dark:bg-card"
          style={{ left: cropHover.left, top: cropHover.top, width: 220, height: 220 }}
          data-testid="candidate-preview-hover"
          role="presentation"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cropHover.url}
            alt=""
            className="size-full object-contain"
          />
        </div>
      ) : null}

      <Dialog
        open={Boolean(imagePreview)}
        onOpenChange={(open) => {
          if (!open) setImagePreview(null);
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          data-testid="category-product-image-preview"
        >
          <DialogHeader>
            <DialogTitle className="text-base">
              {imagePreview?.label ?? t("takeoff.category.productImage")}
            </DialogTitle>
          </DialogHeader>
          {imagePreview ? (
            <div className="flex items-center justify-center rounded-lg border border-border bg-white p-4 dark:bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview.url}
                alt={imagePreview.label}
                referrerPolicy="no-referrer"
                className="max-h-[min(70vh,28rem)] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 1) Supplier catalog with photos — primary entry for Nová položka. */}
      <ElectricalCatalogPickerDialog
        open={electricalCatalogOpen}
        onOpenChange={setElectricalCatalogOpen}
        onPick={(product: ElectricalCatalogProduct) => {
          const noteParts = [
            product.brand,
            product.series,
            product.supplierSku ? `kód ${product.supplierSku}` : null,
          ].filter(Boolean);
          const catalog = {
            productId: product.id,
            unitPrice: productUnitPriceEur(product),
            unit: product.unit || "ks",
            note: noteParts.length ? noteParts.join(" · ") : undefined,
            imageUrl: resolveCatalogProductImageUrl(product),
            quoteCategory: "material" as const,
          };
          setElectricalCatalogOpen(false);
          if (catalogPickerPurpose === "edit" && renameFor && onRenameCategory) {
            const label = product.name.trim();
            setRenameBusy(true);
            void onRenameCategory(renameFor.key, label, catalog)
              .then(() => {
                setRenameFor(null);
                setRenameValue("");
              })
              .finally(() => setRenameBusy(false));
            return;
          }
          startNewPositionCategory({
            label: product.name.trim(),
            symbolType: symbolTypeFromElectricalProduct(product),
            catalog,
          });
        }}
        onAddCustom={() => {
          setElectricalCatalogOpen(false);
          if (catalogPickerPurpose === "edit") {
            return;
          }
          setNewCategoryLabel("");
          setNewCategoryType("generic");
          setNewCategoryOpen(true);
        }}
        onOpenCompanyCatalog={() => {
          setElectricalCatalogOpen(false);
          setCompanyCatalogOpen(true);
        }}
      />

      {/* 2) Own items (products + work) — from electrical footer or custom dialog. */}
      <CatalogItemPickerDialog
        open={companyCatalogOpen}
        onOpenChange={setCompanyCatalogOpen}
        onPick={(item: CatalogItemDoc) => {
          const catalog = {
            productId: item.id,
            unitPrice: item.unitPrice,
            unit: item.unit || "ks",
            note: item.description,
            quoteCategory: (item.kind === "work" ? "work" : "material") as
              | "work"
              | "material",
          };
          setCompanyCatalogOpen(false);
          if (catalogPickerPurpose === "edit" && renameFor && onRenameCategory) {
            const label = item.name.trim();
            setRenameBusy(true);
            void onRenameCategory(renameFor.key, label, catalog)
              .then(() => {
                setRenameFor(null);
                setRenameValue("");
              })
              .finally(() => setRenameBusy(false));
            return;
          }
          startNewPositionCategory({
            label: item.name.trim(),
            symbolType: "generic",
            catalog,
          });
        }}
        onAddCustom={() => {
          setCompanyCatalogOpen(false);
          if (catalogPickerPurpose === "edit") {
            return;
          }
          setNewCategoryLabel("");
          setNewCategoryType("generic");
          setNewCategoryOpen(true);
        }}
      />

      {/* New position — custom name fallback (from Pridať vlastnú položku). */}
      <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("takeoff.category.newTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("takeoff.category.newHint")}</p>
            <Button
              type="button"
              variant="default"
              className="w-full justify-start"
              data-testid="new-category-pick-catalog"
              onClick={() => {
                setNewCategoryOpen(false);
                setCatalogPickerPurpose("new");
                setElectricalCatalogOpen(true);
              }}
            >
              <Library className="mr-2 size-3.5" />
              {t("takeoff.category.pickFromCatalog")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              data-testid="new-category-pick-own"
              onClick={() => {
                setNewCategoryOpen(false);
                setCatalogPickerPurpose("new");
                setCompanyCatalogOpen(true);
              }}
            >
              <Hammer className="mr-2 size-3.5" />
              {t("takeoff.category.pickFromOwnWorks")}
            </Button>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("takeoff.category.orCustomName")}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-category-label" className="text-xs text-muted-foreground">
                {t("takeoff.category.nameLabel")}
              </Label>
              <Input
                id="new-category-label"
                value={newCategoryLabel}
                autoFocus
                placeholder={t("takeoff.category.namePlaceholder")}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCategoryLabel.trim()) {
                    e.preventDefault();
                    setNewCategoryOpen(false);
                    startNewPositionCategory({
                      label: newCategoryLabel.trim(),
                      symbolType: newCategoryType,
                    });
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("takeoff.review.symbolType")}
              </Label>
              <Select
                value={newCategoryType}
                onValueChange={(value) => {
                  if (value) setNewCategoryType(value);
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYMBOL_TYPE_OPTIONS.map((opt) => {
                    const key =
                      opt === "led_strip"
                        ? "takeoff.type.ledStrip"
                        : opt === "distribution_board"
                          ? "takeoff.type.distributionBoard"
                          : opt === "unknown"
                            ? "takeoff.type.unknown"
                            : `takeoff.type.${opt}`;
                    return (
                      <SelectItem key={opt} value={opt}>
                        {t(key)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewCategoryOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!newCategoryLabel.trim()}
              data-testid="new-category-start"
              onClick={() => {
                setNewCategoryOpen(false);
                startNewPositionCategory({
                  label: newCategoryLabel.trim(),
                  symbolType: newCategoryType,
                });
              }}
            >
              <MousePointerClick className="mr-1 size-3.5" />
              {t("takeoff.category.startMarking")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
