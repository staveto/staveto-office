"use client";

/**
 * Dev-only "Debug detekcie" panel — shows the last analyze-region diagnostics:
 * region crop, per-color detection counts, candidates before/after filtering,
 * reject reasons and threshold values.
 *
 * Rendering is read-only: nothing here can change candidates, symbols or
 * quantities. Visible only when isTakeoffDetectionDebugEnabled().
 */

import { useMemo, useState } from "react";
import { Bug, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegionAnalyzeDebug } from "@/lib/takeoff/regionAnalyzer";
import { colorLayerAccent } from "@/lib/takeoff/candidateReview";
import type { SymbolColorLayer } from "@/types/pdfTakeoff";

const MASK_LAYERS: SymbolColorLayer[] = ["green", "red", "orange", "blue", "gray", "unknown"];

type Props = {
  debug: RegionAnalyzeDebug | null;
  regionImageUrl?: string | null;
};

export function TakeoffDetectionDebugPanel({ debug, regionImageUrl }: Props) {
  const [open, setOpen] = useState(false);

  const byLayer = useMemo(() => {
    const map = new Map<SymbolColorLayer, { total: number; kept: number }>();
    for (const d of debug?.detectionsBeforeFilter ?? []) {
      const entry = map.get(d.colorLayer) ?? { total: 0, kept: 0 };
      entry.total++;
      if (!d.rejectReason) entry.kept++;
      map.set(d.colorLayer, entry);
    }
    return map;
  }, [debug]);

  if (!debug) return null;
  const rejected = debug.detectionsBeforeFilter.filter((d) => d.rejectReason);
  const pixels = debug.maskPixelCounts;
  const region = debug.region;

  const fmtRect = (r: { x: number; y: number; width: number; height: number }) =>
    `x ${r.x.toFixed(3)}, y ${r.y.toFixed(3)}, ${r.width.toFixed(3)}×${r.height.toFixed(3)}`;

  return (
    <div
      className="overflow-hidden rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5"
      data-testid="detection-debug-panel"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-amber-800 dark:text-amber-300"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Bug className="size-3.5" />
        Debug detekcie (dev)
        <span className="ml-auto tabular-nums font-normal">
          {debug.detectionsBeforeFilter.length} → {debug.candidatesAfterFilter}
        </span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-amber-500/30 px-3 py-2.5 text-xs">
          {debug.candidatesAfterFilter === 0 ? (
            <p
              data-testid="debug-empty-reason"
              className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-medium text-amber-900 dark:text-amber-200"
            >
              0 kandidátov — dôvod: {debug.emptyReason ?? "unknown"}
            </p>
          ) : null}
          {region ? (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">
                Analyzovaná oblasť{region.autoExpanded ? " (automaticky rozšírená)" : ""}
              </p>
              <ul className="space-y-0.5 tabular-nums text-foreground">
                <li>nakreslená: {fmtRect(region.originalRect)}</li>
                {region.autoExpanded ? (
                  <li>rozšírená: {fmtRect(region.expandedRect)}</li>
                ) : null}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-start gap-4">
            {regionImageUrl ? (
              <div>
                <p className="mb-1 font-medium text-muted-foreground">
                  Výrez regiónu{region?.autoExpanded ? " (rozšírený)" : ""}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={regionImageUrl}
                  alt="Analyzed region crop"
                  className="max-h-40 max-w-[280px] rounded border border-border bg-white object-contain"
                />
              </div>
            ) : null}
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Prahové hodnoty</p>
              <ul className="space-y-0.5 tabular-nums text-foreground">
                <li>minDim: {debug.thresholds.minDimPx}px</li>
                <li>maxDim: {debug.thresholds.maxDimPx}px</li>
                <li>mergeGap: {debug.thresholds.mergeGapPx}px</li>
                <li>maxAspect: {debug.thresholds.maxAspectRatio}</li>
                <li>
                  raster: {debug.regionRasterSize.width}×{debug.regionRasterSize.height}px
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Masky / vrstvy</p>
              <ul className="space-y-0.5">
                {MASK_LAYERS.filter((l) => byLayer.has(l)).map((layer) => {
                  const entry = byLayer.get(layer)!;
                  return (
                    <li key={layer} className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2.5 rounded-sm"
                        style={{ backgroundColor: colorLayerAccent(layer) }}
                      />
                      <span className="text-foreground">
                        {layer}: {entry.kept}/{entry.total}
                      </span>
                    </li>
                  );
                })}
                {byLayer.size === 0 ? (
                  <li className="text-muted-foreground">žiadne detekcie</li>
                ) : null}
              </ul>
            </div>
            {pixels ? (
              <div data-testid="debug-mask-pixels">
                <p className="mb-1 font-medium text-muted-foreground">
                  Farebné pixely (vzorka {pixels.sampledPixels})
                </p>
                <ul className="space-y-0.5 tabular-nums text-foreground">
                  <li>zelené: {pixels.green}</li>
                  <li>červené: {pixels.red}</li>
                  <li>oranžové: {pixels.orange}</li>
                  <li>modré: {pixels.blue}</li>
                </ul>
              </div>
            ) : null}
          </div>

          {debug.templateMatchesBeforeDedupe && debug.templateMatchesBeforeDedupe.length > 0 ? (
            <div data-testid="debug-template-matches">
              <p className="mb-1 font-medium text-muted-foreground">
                Zhody so šablónami pred zlúčením ({debug.templateMatchesBeforeDedupe.length})
                {typeof debug.mergedWithRasterCount === "number" && debug.mergedWithRasterCount > 0
                  ? ` — zlúčené s rastrovými kandidátmi: ${debug.mergedWithRasterCount}`
                  : ""}
              </p>
              <ul className="space-y-0.5 tabular-nums text-foreground">
                {debug.templateMatchesBeforeDedupe.map((t) => (
                  <li key={t.id} className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2 rounded-sm"
                      style={{ backgroundColor: colorLayerAccent(t.color_layer) }}
                    />
                    {t.label_suggestions[0]?.label ?? "symbol"} ({t.confidence.toFixed(2)})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {typeof debug.overlapsTextRejectedCount === "number" && debug.overlapsTextRejectedCount > 0 ? (
            <p className="text-muted-foreground" data-testid="debug-overlaps-text">
              Zamietnuté ako prekrytie s OCR textom: {debug.overlapsTextRejectedCount}
            </p>
          ) : null}
          <div>
            <p className="mb-1 font-medium text-muted-foreground">
              Detekcie pred filtrovaním ({debug.detectionsBeforeFilter.length}), po
              filtrovaní ({debug.candidatesAfterFilter}), zamietnuté ({rejected.length})
            </p>
            <div className="max-h-44 overflow-auto rounded border border-border bg-card">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-1.5 py-1">vrstva</th>
                    <th className="px-1.5 py-1">bbox (px)</th>
                    <th className="px-1.5 py-1">aspect</th>
                    <th className="px-1.5 py-1">score</th>
                    <th className="px-1.5 py-1">výsledok</th>
                  </tr>
                </thead>
                <tbody>
                  {debug.detectionsBeforeFilter.map((d) => (
                    <tr
                      key={d.id}
                      className={cn(
                        "border-t border-border/60",
                        d.rejectReason && "text-muted-foreground line-through"
                      )}
                    >
                      <td className="px-1.5 py-0.5">
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="inline-block size-2 rounded-sm"
                            style={{ backgroundColor: colorLayerAccent(d.colorLayer) }}
                          />
                          {d.colorLayer}
                        </span>
                      </td>
                      <td className="px-1.5 py-0.5 tabular-nums">
                        {d.bboxLocalPx.join(", ")}
                      </td>
                      <td className="px-1.5 py-0.5 tabular-nums">{d.aspect}</td>
                      <td className="px-1.5 py-0.5 tabular-nums">{d.matchScore}</td>
                      <td className="px-1.5 py-0.5">
                        {d.rejectReason ? `zamietnuté: ${d.rejectReason}` : "kandidát"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
