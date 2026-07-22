"use client";

/**
 * "Káble a trasy" — right-panel section of the Plan Takeoff Workbench.
 *
 * Lists measured cable routes (polylines drawn on the PDF), lets the user
 * edit route parameters (cable type, installation type, reserves, status),
 * shows a summary grouped by cable type and exports APPROVED routes into
 * the quote as takeoff items (idempotent — see cableMeasurement.ts).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Cable,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Highlighter,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { getWorkspaceStorageKey } from "@/lib/workspaceStorage";
import { listCatalogItems, type CatalogItemDoc } from "@/services/materials";
import { cn } from "@/lib/utils";
import type {
  CableInstallationType,
  CableRun,
  CableRunStatus,
} from "@/types/pdfTakeoff";
import {
  CABLE_RUN_COLOR_PALETTE,
  CABLE_RUN_STROKE_PRESETS,
  DEFAULT_CABLE_TYPE_NAMES,
  groupCableRunsByType,
  resolveCableRunColor,
  resolveCableRunStrokeWidth,
} from "@/lib/takeoff/cableMeasurement";
import { categoryColorForKey, categoryKeyForLabel } from "@/lib/takeoff/takeoffCategories";

const INSTALLATION_TYPES: CableInstallationType[] = [
  "groove",
  "surface_trunking",
  "conduit",
  "ceiling",
  "drywall",
  "floor",
  "other",
];

const STATUSES: CableRunStatus[] = ["draft", "review", "checked", "approved"];

const STATUS_BADGE_CLASSES: Record<CableRunStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-amber-100 text-amber-800",
  checked: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
};

type Props = {
  runs: CableRun[];
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
  /** Start drawing a new route on the PDF (switches to measure_cable). */
  onStartNewRun?: () => void;
  /** False while the drawing has no scale calibration — new routes blocked. */
  hasCalibration: boolean;
  onUpdateRun?: (runId: string, patch: Partial<CableRun>) => void;
  onDeleteRun?: (runId: string) => void;
  /** Jump to the route's page in the viewer and open vertex editing. */
  onEditRunOnPlan?: (runId: string) => void;
  /** Highlight filter — highlighted routes pop on the plan, others fade. */
  highlightedRunIds?: string[];
  onToggleRunHighlight?: (runId: string) => void;
  onSetHighlightedRuns?: (runIds: string[]) => void;
  /** Export approved runs into the quote (idempotent upsert). */
  onExportApproved?: () => void;
  exportBusy?: boolean;
  exportMessage?: string | null;
  /**
   * Quantities already in the quote per cable group key (from takeoffItems
   * with sourceType=cable_run_group). Lets the summary show sync status.
   */
  exportedGroupQuantities?: Record<string, number>;
};

function formatM(value: number): string {
  return `${Math.round(value * 100) / 100} m`;
}

export function CableRunsPanel({
  runs,
  selectedRunId,
  onSelectRun,
  onStartNewRun,
  hasCalibration,
  onUpdateRun,
  onDeleteRun,
  onEditRunOnPlan,
  highlightedRunIds = [],
  onToggleRunHighlight,
  onSetHighlightedRuns,
  onExportApproved,
  exportBusy = false,
  exportMessage = null,
  exportedGroupQuantities = {},
}: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const workspaceKey =
    activeWorkspace && user ? getWorkspaceStorageKey(activeWorkspace, user.id) : null;

  const [open, setOpen] = useState(runs.length > 0);
  const [catalogItems, setCatalogItems] = useState<CatalogItemDoc[]>([]);

  // Selecting a route (from the plan or the list) always reveals the panel —
  // state adjusted during render (no effect → no cascading re-render).
  const [lastSelectedRunId, setLastSelectedRunId] = useState(selectedRunId);
  if (selectedRunId !== lastSelectedRunId) {
    setLastSelectedRunId(selectedRunId);
    if (selectedRunId) setOpen(true);
  }

  // Meter-unit catalog products — offered as cable type sources so the
  // exported quote row can carry the catalog price. Loaded once per open.
  useEffect(() => {
    if (!open || !workspaceKey || catalogItems.length > 0) return;
    let cancelled = false;
    void listCatalogItems(workspaceKey)
      .then((items) => {
        if (cancelled) return;
        setCatalogItems(
          items.filter((i) => (i.unit ?? "").trim().toLowerCase() === "m")
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, workspaceKey, catalogItems.length]);

  const groups = useMemo(() => groupCableRunsByType(runs), [runs]);
  const approvedCount = runs.filter((r) => r.status === "approved").length;

  /** Per-group sync: approved meters vs what the quote already has. */
  const groupSync = useMemo(() => {
    return groups.map((g) => {
      const approvedRuns = g.runs.filter((r) => r.status === "approved");
      const approvedM =
        Math.round(
          approvedRuns.reduce((s, r) => s + r.finalLengthM, 0) * 100
        ) / 100;
      const inQuoteM = exportedGroupQuantities[g.key] ?? 0;
      const status: "synced" | "needs_export" | "not_approved" | "stale_quote" =
        approvedM <= 0
          ? inQuoteM > 0
            ? "stale_quote"
            : "not_approved"
          : Math.abs(approvedM - inQuoteM) < 0.01
            ? "synced"
            : "needs_export";
      return { group: g, approvedM, inQuoteM, status };
    });
  }, [groups, exportedGroupQuantities]);

  const syncCounts = useMemo(() => {
    let synced = 0;
    let needsExport = 0;
    let notApproved = 0;
    for (const row of groupSync) {
      if (row.status === "synced") synced += 1;
      else if (row.status === "needs_export" || row.status === "stale_quote")
        needsExport += 1;
      else notApproved += 1;
    }
    return { synced, needsExport, notApproved };
  }, [groupSync]);

  const installationLabel = (type: CableInstallationType) =>
    t(`takeoff.measure.installation.${type}`);
  const statusLabel = (status: CableRunStatus) =>
    t(`takeoff.measure.statusValue.${status}`);

  const cableTypeOptions = useMemo(() => {
    const names = new Set<string>(DEFAULT_CABLE_TYPE_NAMES);
    for (const r of runs) names.add(r.cableTypeName);
    return [...names];
  }, [runs]);

  return (
    // max-h + internal scroll: a long run editor must never overflow the
    // right column and bleed over the sections below it.
    <div
      className="flex max-h-[360px] min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
      data-testid="cable-runs-panel"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <Cable className="size-3.5 shrink-0 text-emerald-700" />
          <span className="truncate text-xs font-semibold text-foreground">
            {t("takeoff.measure.cablesAndRoutes")}
          </span>
          {runs.length > 0 ? (
            <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800">
              {runs.length}
            </span>
          ) : null}
        </button>
        {onStartNewRun ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-emerald-600/50 text-xs text-emerald-700 hover:bg-emerald-50"
            data-testid="cable-runs-new"
            disabled={!hasCalibration}
            title={
              hasCalibration
                ? t("takeoff.measure.addRouteHint")
                : t("takeoff.measure.scaleMissing")
            }
            onClick={() => {
              setOpen(true);
              onStartNewRun();
            }}
          >
            <Plus className="size-3.5" />
            {t("takeoff.measure.addRoute")}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-border p-2.5">
          {!hasCalibration ? (
            <p className="rounded-md border border-dashed border-amber-400/60 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800">
              {t("takeoff.measure.scaleMissing")}
            </p>
          ) : null}

          {runs.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              {t("takeoff.measure.emptyRuns")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {runs.map((run) => {
                const picked = run.id === selectedRunId;
                const highlighted = highlightedRunIds.includes(run.id);
                return (
                  <li key={run.id}>
                    <div
                      className={cn(
                        "rounded-md border px-2 py-1.5",
                        picked
                          ? "border-emerald-600 bg-emerald-50/60"
                          : highlighted
                            ? "border-amber-500/70 bg-amber-50/40"
                            : "border-border bg-card hover:border-emerald-600/50"
                      )}
                    >
                      <div className="flex w-full items-center gap-1.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => onSelectRun(picked ? null : run.id)}
                          title={t("takeoff.measure.selectRunHint")}
                        >
                          <span
                            className="size-3 shrink-0 rounded-full border border-black/10"
                            style={{
                              backgroundColor: resolveCableRunColor(run, (name) =>
                                categoryColorForKey(categoryKeyForLabel(name))
                              ),
                            }}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-foreground">
                              {run.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {run.cableTypeName} · {installationLabel(run.installationType)}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-xs font-bold tabular-nums text-foreground">
                              {formatM(run.finalLengthM)}
                            </span>
                            <span
                              className={cn(
                                "inline-block rounded-full px-1.5 py-px text-[10px] font-semibold",
                                STATUS_BADGE_CLASSES[run.status]
                              )}
                            >
                              {statusLabel(run.status)}
                            </span>
                          </span>
                        </button>
                        {onToggleRunHighlight ? (
                          <button
                            type="button"
                            className={cn(
                              "shrink-0 rounded p-1",
                              highlighted
                                ? "bg-amber-100 text-amber-700"
                                : "text-muted-foreground hover:bg-muted"
                            )}
                            data-testid="cable-run-highlight"
                            title={t("takeoff.measure.highlightRunHint")}
                            onClick={() => onToggleRunHighlight(run.id)}
                          >
                            <Highlighter className="size-3.5" />
                          </button>
                        ) : null}
                      </div>

                      {picked ? (
                        <div className="mt-2 space-y-2 border-t border-border pt-2">
                          {/* Computed lengths */}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span>
                              {t("takeoff.measure.routeLength")}:{" "}
                              <strong className="tabular-nums text-foreground">
                                {formatM(run.measured2dLengthM)}
                              </strong>
                            </span>
                            <span>
                              {t("takeoff.measure.finalLength")}:{" "}
                              <strong className="tabular-nums text-foreground">
                                {formatM(run.finalLengthM)}
                              </strong>
                            </span>
                          </div>

                          {onUpdateRun ? (
                            <>
                              <label className="block">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {t("takeoff.measure.runName")}
                                </span>
                                <Input
                                  className="mt-0.5 h-7 text-xs"
                                  value={run.name}
                                  onChange={(e) =>
                                    onUpdateRun(run.id, { name: e.target.value })
                                  }
                                />
                              </label>

                              <div className="space-y-1.5">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {t("takeoff.measure.lineStyle")}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {(() => {
                                    const currentColor = resolveCableRunColor(run, (name) =>
                                      categoryColorForKey(categoryKeyForLabel(name))
                                    ).toLowerCase();
                                    return (
                                      <>
                                        {CABLE_RUN_COLOR_PALETTE.map((hex) => {
                                          const active = currentColor === hex.toLowerCase();
                                          return (
                                            <button
                                              key={hex}
                                              type="button"
                                              className={cn(
                                                "size-6 rounded-full border-2 transition-shadow",
                                                active
                                                  ? "border-foreground shadow-sm"
                                                  : "border-transparent hover:border-border"
                                              )}
                                              style={{ backgroundColor: hex }}
                                              title={t("takeoff.measure.lineColorHint")}
                                              aria-label={t("takeoff.measure.lineColorHint")}
                                              aria-pressed={active}
                                              data-testid="cable-run-color"
                                              onClick={() =>
                                                onUpdateRun(run.id, { color: hex })
                                              }
                                            />
                                          );
                                        })}
                                        <label
                                          className="relative size-6 cursor-pointer overflow-hidden rounded-full border border-border"
                                          title={t("takeoff.measure.lineColorCustom")}
                                        >
                                          <span
                                            className="absolute inset-0"
                                            style={{ backgroundColor: currentColor }}
                                          />
                                          <input
                                            type="color"
                                            className="absolute inset-0 cursor-pointer opacity-0"
                                            value={currentColor}
                                            onChange={(e) =>
                                              onUpdateRun(run.id, { color: e.target.value })
                                            }
                                            aria-label={t("takeoff.measure.lineColorCustom")}
                                          />
                                        </label>
                                      </>
                                    );
                                  })()}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {t("takeoff.measure.lineThickness")}
                                  </span>
                                  <div className="flex flex-1 items-center gap-1">
                                    {CABLE_RUN_STROKE_PRESETS.map((w) => {
                                      const active =
                                        resolveCableRunStrokeWidth(run) === w;
                                      return (
                                        <button
                                          key={w}
                                          type="button"
                                          className={cn(
                                            "flex h-7 flex-1 items-center justify-center rounded-md border px-1",
                                            active
                                              ? "border-emerald-600 bg-emerald-50"
                                              : "border-border bg-background hover:bg-muted/60"
                                          )}
                                          title={`${w} px`}
                                          aria-pressed={active}
                                          data-testid="cable-run-stroke"
                                          onClick={() =>
                                            onUpdateRun(run.id, { strokeWidth: w })
                                          }
                                        >
                                          <span
                                            className="block w-full rounded-full bg-foreground"
                                            style={{ height: Math.max(1, w * 0.7) }}
                                          />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                              <label className="block">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {t("takeoff.measure.circuitName")}
                                </span>
                                <Input
                                  className="mt-0.5 h-7 text-xs"
                                  value={run.circuitName ?? ""}
                                  placeholder={t("takeoff.measure.circuitPlaceholder")}
                                  onChange={(e) =>
                                    onUpdateRun(run.id, { circuitName: e.target.value })
                                  }
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {t("takeoff.measure.cableType")}
                                </span>
                                <select
                                  className="mt-0.5 h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
                                  value={
                                    run.catalogItemId
                                      ? `catalog:${run.catalogItemId}`
                                      : cableTypeOptions.includes(run.cableTypeName)
                                        ? `name:${run.cableTypeName}`
                                        : "custom"
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (v.startsWith("catalog:")) {
                                      const item = catalogItems.find(
                                        (c) => c.id === v.slice("catalog:".length)
                                      );
                                      if (item) {
                                        onUpdateRun(run.id, {
                                          catalogItemId: item.id,
                                          cableTypeName: item.name,
                                        });
                                      }
                                    } else if (v.startsWith("name:")) {
                                      onUpdateRun(run.id, {
                                        catalogItemId: undefined,
                                        cableTypeName: v.slice("name:".length),
                                      });
                                    }
                                  }}
                                >
                                  {cableTypeOptions.map((name) => (
                                    <option key={name} value={`name:${name}`}>
                                      {name}
                                    </option>
                                  ))}
                                  {catalogItems.length > 0 ? (
                                    <optgroup label={t("takeoff.measure.catalogGroup")}>
                                      {catalogItems.map((item) => (
                                        <option key={item.id} value={`catalog:${item.id}`}>
                                          {item.name}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ) : null}
                                  {!cableTypeOptions.includes(run.cableTypeName) &&
                                  !run.catalogItemId ? (
                                    <option value="custom">{run.cableTypeName}</option>
                                  ) : null}
                                </select>
                                <Input
                                  className="mt-1 h-7 text-xs"
                                  value={run.cableTypeName}
                                  placeholder={t("takeoff.measure.cableTypeCustom")}
                                  onChange={(e) =>
                                    onUpdateRun(run.id, {
                                      cableTypeName: e.target.value,
                                      catalogItemId: undefined,
                                    })
                                  }
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {t("takeoff.measure.installationType")}
                                </span>
                                <select
                                  className="mt-0.5 h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
                                  value={run.installationType}
                                  onChange={(e) =>
                                    onUpdateRun(run.id, {
                                      installationType: e.target
                                        .value as CableInstallationType,
                                    })
                                  }
                                >
                                  {INSTALLATION_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {installationLabel(type)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    {t("takeoff.measure.verticalLength")}
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    className="mt-0.5 h-7 text-xs"
                                    value={run.verticalLengthM}
                                    onChange={(e) =>
                                      onUpdateRun(run.id, {
                                        verticalLengthM: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    {t("takeoff.measure.fixedReserve")}
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    className="mt-0.5 h-7 text-xs"
                                    value={run.fixedReserveM}
                                    onChange={(e) =>
                                      onUpdateRun(run.id, {
                                        fixedReserveM: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    {t("takeoff.measure.reservePercent")}
                                  </span>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={1}
                                    className="mt-0.5 h-7 text-xs"
                                    value={run.reservePercent}
                                    onChange={(e) =>
                                      onUpdateRun(run.id, {
                                        reservePercent: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    {t("takeoff.measure.roundingStep")}
                                  </span>
                                  <Input
                                    type="number"
                                    min={0.1}
                                    step={0.5}
                                    className="mt-0.5 h-7 text-xs"
                                    value={run.roundingStepM}
                                    onChange={(e) =>
                                      onUpdateRun(run.id, {
                                        roundingStepM: Number(e.target.value) || 1,
                                      })
                                    }
                                  />
                                </label>
                              </div>
                              <label className="block">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {t("takeoff.measure.status")}
                                </span>
                                <select
                                  className="mt-0.5 h-7 w-full rounded-md border border-border bg-background px-2 text-xs"
                                  data-testid="cable-run-status"
                                  value={run.status}
                                  onChange={(e) =>
                                    onUpdateRun(run.id, {
                                      status: e.target.value as CableRunStatus,
                                    })
                                  }
                                >
                                  {STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {statusLabel(status)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </>
                          ) : null}

                          <div className="flex items-center gap-1.5 pt-0.5">
                            {onEditRunOnPlan ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 gap-1 text-xs"
                                data-testid="cable-run-edit-on-plan"
                                title={t("takeoff.measure.editOnPlanHint")}
                                onClick={() => onEditRunOnPlan(run.id)}
                              >
                                <Pencil className="size-3.5" />
                                {t("takeoff.measure.editOnPlan")}
                              </Button>
                            ) : null}
                            {onUpdateRun && run.status !== "approved" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 flex-1 gap-1 border-emerald-600/50 text-xs text-emerald-700 hover:bg-emerald-50"
                                data-testid="cable-run-approve"
                                onClick={() =>
                                  onUpdateRun(run.id, { status: "approved" })
                                }
                              >
                                <CheckCircle2 className="size-3.5" />
                                {t("takeoff.measure.approve")}
                              </Button>
                            ) : null}
                            {onDeleteRun ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-xs text-red-600 hover:bg-red-50"
                                data-testid="cable-run-delete"
                                onClick={() => onDeleteRun(run.id)}
                              >
                                <Trash2 className="size-3.5" />
                                {t("takeoff.review.delete")}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Summary by cable type — length + quote sync status so you can
              see at a glance whether CYKY 5x2,5 (etc.) made it into the quote. */}
          {groupSync.length > 0 ? (
            <div
              className="rounded-md bg-muted/50 px-2 py-1.5"
              data-testid="cable-runs-summary"
            >
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[11px] font-semibold text-foreground">
                  {t("takeoff.measure.summaryByCableType")}
                </p>
                {onSetHighlightedRuns && highlightedRunIds.length > 0 ? (
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-semibold text-amber-700 hover:underline"
                    data-testid="cable-run-highlight-clear"
                    onClick={() => onSetHighlightedRuns([])}
                  >
                    {t("takeoff.measure.clearHighlight")}
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("takeoff.measure.summarySyncHint", {
                  synced: String(syncCounts.synced),
                  pending: String(syncCounts.needsExport),
                  draft: String(syncCounts.notApproved),
                })}
              </p>
              <ul className="mt-1 space-y-1">
                {groupSync.map(({ group: g, approvedM, inQuoteM, status }) => {
                  const groupIds = g.runs.map((r) => r.id);
                  const allOn =
                    groupIds.length > 0 &&
                    groupIds.every((id) => highlightedRunIds.includes(id));
                  const statusLabelText =
                    status === "synced"
                      ? t("takeoff.measure.syncInQuote", {
                          length: String(inQuoteM),
                        })
                      : status === "needs_export"
                        ? t("takeoff.measure.syncNeedsExport", {
                            approved: String(approvedM),
                            inQuote: String(inQuoteM),
                          })
                        : status === "stale_quote"
                          ? t("takeoff.measure.syncStaleQuote", {
                              length: String(inQuoteM),
                            })
                          : t("takeoff.measure.syncNotApproved", {
                              length: String(g.totalFinalLengthM),
                            });
                  const statusClass =
                    status === "synced"
                      ? "text-emerald-700"
                      : status === "not_approved"
                        ? "text-muted-foreground"
                        : "text-amber-700";
                  const row = (
                    <>
                      {onSetHighlightedRuns ? (
                        <Highlighter
                          className={cn(
                            "size-3 shrink-0",
                            allOn ? "text-amber-600" : "text-muted-foreground/50"
                          )}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {g.cableTypeName || t("takeoff.measure.unnamedCableType")}
                          {" · "}
                          {installationLabel(g.installationType)}
                        </span>
                        <span className={cn("block text-[10px]", statusClass)}>
                          {statusLabelText}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold tabular-nums text-foreground">
                          {formatM(g.totalFinalLengthM)}
                        </span>
                        <span className="block text-[10px] tabular-nums text-muted-foreground">
                          {t("takeoff.measure.approvedOfTotal", {
                            approved: String(approvedM),
                          })}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={g.key}>
                      {onSetHighlightedRuns ? (
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-[11px]",
                            allOn
                              ? "bg-amber-100/70 text-amber-900"
                              : "hover:bg-muted"
                          )}
                          data-testid="cable-run-highlight-group"
                          title={t("takeoff.measure.highlightGroupHint")}
                          onClick={() =>
                            onSetHighlightedRuns(
                              allOn
                                ? highlightedRunIds.filter(
                                    (id) => !groupIds.includes(id)
                                  )
                                : [
                                    ...new Set([...highlightedRunIds, ...groupIds]),
                                  ]
                            )
                          }
                        >
                          {row}
                        </button>
                      ) : (
                        <div className="flex items-start gap-1.5 px-1 py-0.5 text-[11px]">
                          {row}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Export approved runs into the quote */}
          {onExportApproved ? (
            <div className="space-y-1">
              <Button
                type="button"
                size="sm"
                className="h-8 w-full gap-1 text-xs"
                data-testid="cable-runs-export"
                disabled={exportBusy || approvedCount === 0}
                onClick={onExportApproved}
                title={
                  approvedCount === 0
                    ? t("takeoff.measure.exportNoneApproved")
                    : undefined
                }
              >
                {exportBusy
                  ? t("common.loading")
                  : `${t("takeoff.measure.addApprovedToQuote")}${
                      approvedCount > 0 ? ` (${approvedCount})` : ""
                    }`}
              </Button>
              {exportMessage ? (
                <p className="text-[11px] text-emerald-700" role="status">
                  {exportMessage}
                </p>
              ) : null}
              {approvedCount === 0 && runs.length > 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("takeoff.measure.exportNoneApproved")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
