"use client";

/**
 * Precise-pick loupe with stack-split for overlapping symbols.
 *
 * Worst case: several marks share the same spot. The UI isolates ONE mark at
 * a time (others ghosted), fans number badges apart, and lets the user save
 * each as its own position — then continue with the next.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Layers, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { NearbySymbolCandidate } from "@/lib/ai/pickSymbolFromClick";
import { isOverlappingStack } from "@/lib/ai/overlappingSymbolStack";
import { buildTintedSymbolMask, hexToRgb } from "@/lib/ai/symbolShapeOutline";

const CANDIDATE_COLORS = ["#E95F2A", "#2563EB", "#16A34A", "#DC2626", "#0891B2", "#7C3AED"];
const PART_COLOR = "#64748B";
const TARGET_PREVIEW_PX = 420;
const MIN_CROP_HALF = 56;
const MAX_CROP_HALF = 140;
const CROP_PAD_PX = 28;

export type ConfirmLoupeOptions = {
  /** Keep loupe open after save so the next stacked mark can be saved. */
  continueSeparating?: boolean;
};

export type SymbolDetailLoupeProps = {
  imageData: ImageData;
  pageWidth: number;
  pageHeight: number;
  centerCanvasPx: { x: number; y: number };
  candidates: NearbySymbolCandidate[];
  onConfirmCandidates: (
    candidates: NearbySymbolCandidate[],
    options?: ConfirmLoupeOptions
  ) => void;
  onPickPoint: (canvasPx: { x: number; y: number }) => void;
  onClose: () => void;
};

function frameLoupeCrop(
  center: { x: number; y: number },
  candidates: NearbySymbolCandidate[],
  pageWidth: number,
  pageHeight: number
): { x0: number; y0: number; x1: number; y1: number } {
  let minX = center.x;
  let maxX = center.x;
  let minY = center.y;
  let maxY = center.y;
  for (const c of candidates) {
    minX = Math.min(minX, c.pixelBbox.minX);
    maxX = Math.max(maxX, c.pixelBbox.maxX);
    minY = Math.min(minY, c.pixelBbox.minY);
    maxY = Math.max(maxY, c.pixelBbox.maxY);
  }
  minX -= CROP_PAD_PX;
  maxX += CROP_PAD_PX;
  minY -= CROP_PAD_PX;
  maxY += CROP_PAD_PX;

  let halfW = Math.max(MIN_CROP_HALF, Math.ceil((maxX - minX) / 2));
  let halfH = Math.max(MIN_CROP_HALF, Math.ceil((maxY - minY) / 2));
  halfW = Math.min(MAX_CROP_HALF, halfW);
  halfH = Math.min(MAX_CROP_HALF, halfH);

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    x0: Math.max(0, Math.floor(midX - halfW)),
    y0: Math.max(0, Math.floor(midY - halfH)),
    x1: Math.min(pageWidth, Math.ceil(midX + halfW)),
    y1: Math.min(pageHeight, Math.ceil(midY + halfH)),
  };
}

function fanOffset(i: number, n: number, radiusPx: number): { dx: number; dy: number } {
  if (n <= 1) return { dx: 0, dy: 0 };
  const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
  return { dx: Math.cos(angle) * radiusPx, dy: Math.sin(angle) * radiusPx };
}

function closestIndex(
  candidates: NearbySymbolCandidate[],
  center: { x: number; y: number }
): number {
  if (candidates.length === 0) return 0;
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  candidates.forEach((c, i) => {
    const cx = (c.pixelBbox.minX + c.pixelBbox.maxX) / 2;
    const cy = (c.pixelBbox.minY + c.pixelBbox.maxY) / 2;
    const d = (cx - center.x) ** 2 + (cy - center.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function SymbolDetailLoupe({
  imageData,
  pageWidth,
  pageHeight,
  centerCanvasPx,
  candidates,
  onConfirmCandidates,
  onPickPoint,
  onClose,
}: SymbolDetailLoupeProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const fullCandidates = useMemo(
    () => candidates.filter((c) => !c.partOnly),
    [candidates]
  );
  const partCandidates = useMemo(
    () => candidates.filter((c) => c.partOnly),
    [candidates]
  );
  const stackMode = isOverlappingStack(candidates);

  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const remainingFull = useMemo(
    () => fullCandidates.filter((c) => !savedIds.has(c.id)),
    [fullCandidates, savedIds]
  );

  const [focusId, setFocusId] = useState<string | null>(() => {
    const pool = fullCandidates.length > 0 ? fullCandidates : candidates;
    if (pool.length === 0) return null;
    return pool[closestIndex(pool, centerCanvasPx)]!.id;
  });

  // Keep focus on a remaining mark after saves.
  useEffect(() => {
    if (focusId && remainingFull.some((c) => c.id === focusId)) return;
    if (remainingFull.length > 0) {
      setFocusId(remainingFull[0]!.id);
      return;
    }
    if (fullCandidates.length === 0 && candidates.length > 0) {
      setFocusId(candidates[0]!.id);
    }
  }, [focusId, remainingFull, fullCandidates.length, candidates]);

  const focusCandidate =
    candidates.find((c) => c.id === focusId) ?? remainingFull[0] ?? null;
  const focusIdx = focusCandidate
    ? candidates.findIndex((c) => c.id === focusCandidate.id)
    : -1;

  const frame = useMemo(
    () => frameLoupeCrop(centerCanvasPx, candidates, pageWidth, pageHeight),
    [centerCanvasPx, candidates, pageWidth, pageHeight]
  );
  const { x0, y0, x1, y1 } = frame;
  const srcW = Math.max(1, x1 - x0);
  const srcH = Math.max(1, y1 - y0);
  const zoom = Math.max(
    2,
    Math.min(5, Math.floor(TARGET_PREVIEW_PX / Math.max(srcW, srcH)))
  );
  const dispW = Math.round(srcW * zoom);
  const dispH = Math.round(srcH * zoom);

  const candidateColor = (c: NearbySymbolCandidate, i: number): string =>
    c.partOnly ? PART_COLOR : CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]!;

  const saveOne = (c: NearbySymbolCandidate, keepOpen: boolean) => {
    onConfirmCandidates([c], { continueSeparating: keepOpen });
    if (keepOpen) {
      setSavedIds((prev) => new Set(prev).add(c.id));
    }
  };

  const saveFocusedAndNext = () => {
    if (!focusCandidate || focusCandidate.partOnly) return;
    const remainingAfter = remainingFull.filter((c) => c.id !== focusCandidate.id);
    saveOne(focusCandidate, remainingAfter.length > 0);
  };

  const saveAllRemaining = () => {
    const list = remainingFull;
    if (list.length === 0) return;
    list.forEach((c, i) => {
      const isLast = i === list.length - 1;
      onConfirmCandidates([c], { continueSeparating: !isLast });
    });
    setSavedIds((prev) => {
      const next = new Set(prev);
      list.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const stepFocus = (dir: -1 | 1) => {
    if (remainingFull.length === 0) return;
    const idx = remainingFull.findIndex((c) => c.id === focusId);
    const base = idx < 0 ? 0 : idx;
    const next = remainingFull[(base + dir + remainingFull.length) % remainingFull.length]!;
    setFocusId(next.id);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dispW;
    canvas.height = dispH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tmp = document.createElement("canvas");
    tmp.width = srcW;
    tmp.height = srcH;
    const tctx = tmp.getContext("2d");
    if (!tctx) return;
    const crop = tctx.createImageData(srcW, srcH);
    for (let y = 0; y < srcH; y++) {
      for (let x = 0; x < srcW; x++) {
        const si = ((y0 + y) * pageWidth + (x0 + x)) * 4;
        const di = (y * srcW + x) * 4;
        crop.data[di] = imageData.data[si] ?? 255;
        crop.data[di + 1] = imageData.data[si + 1] ?? 255;
        crop.data[di + 2] = imageData.data[si + 2] ?? 255;
        crop.data[di + 3] = 255;
      }
    }
    tctx.putImageData(crop, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.drawImage(tmp, 0, 0, dispW, dispH);

    // Dim non-focused ink in stack mode so the active mark stands out.
    if (stackMode && focusCandidate) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(0, 0, dispW, dispH);
    }

    const fanN = Math.max(1, fullCandidates.length);

    candidates.forEach((c, i) => {
      const saved = savedIds.has(c.id);
      const focused = c.id === focusId;
      const color = saved ? "#16A34A" : candidateColor(c, i);
      const showTint = !stackMode || focused || saved;
      const alpha = saved ? 160 : focused ? 230 : stackMode ? 40 : 130;

      if (showTint || !stackMode) {
        const tint = hexToRgb(color);
        const mask = buildTintedSymbolMask(
          imageData,
          c.pixelBbox,
          pageWidth,
          pageHeight,
          tint,
          { padPx: 1, alpha }
        );
        if (mask && (focused || saved || !stackMode)) {
          const off = document.createElement("canvas");
          off.width = mask.width;
          off.height = mask.height;
          const octx = off.getContext("2d");
          if (octx) {
            octx.putImageData(mask.imageData, 0, 0);
            const dx = (mask.canvasX - x0) * zoom;
            const dy = (mask.canvasY - y0) * zoom;
            if (stackMode && !focused && !saved) {
              octx.globalAlpha = 0.25;
            }
            ctx.drawImage(off, dx, dy, mask.width * zoom, mask.height * zoom);
          }
        }
      }

      if (focused) {
        const bx = (c.pixelBbox.minX - x0) * zoom - 3;
        const by = (c.pixelBbox.minY - y0) * zoom - 3;
        const bw = (c.pixelBbox.maxX - c.pixelBbox.minX + 1) * zoom + 6;
        const bh = (c.pixelBbox.maxY - c.pixelBbox.minY + 1) * zoom + 6;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.strokeRect(bx, by, bw, bh);
      }

      // Fan badges so stacked numbers don't sit on the same pixel.
      const baseCx = ((c.pixelBbox.minX + c.pixelBbox.maxX) / 2 - x0) * zoom;
      const baseCy = ((c.pixelBbox.minY + c.pixelBbox.maxY) / 2 - y0) * zoom;
      const fan = stackMode
        ? fanOffset(i, fanN, Math.max(18, 14 * zoom * 0.35))
        : { dx: 0, dy: 0 };
      const cx = baseCx + fan.dx;
      const cy = baseCy + fan.dy;

      if (stackMode && (focused || !saved)) {
        ctx.beginPath();
        ctx.moveTo(baseCx, baseCy);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = focused ? color : "rgba(100,116,139,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, focused ? 16 : 12, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = focused ? 3 : 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(saved ? "✓" : String(i + 1), cx, cy + 0.5);
    });
  }, [
    imageData,
    pageWidth,
    pageHeight,
    candidates,
    fullCandidates.length,
    savedIds,
    focusId,
    focusCandidate,
    stackMode,
    dispW,
    dispH,
    srcW,
    srcH,
    x0,
    y0,
    zoom,
  ]);

  const hitTest = (canvasX: number, canvasY: number): NearbySymbolCandidate | null => {
    // Prefer focused mark when stacks overlap.
    if (focusCandidate) {
      const c = focusCandidate;
      if (
        canvasX >= c.pixelBbox.minX - 4 &&
        canvasX <= c.pixelBbox.maxX + 4 &&
        canvasY >= c.pixelBbox.minY - 4 &&
        canvasY <= c.pixelBbox.maxY + 4
      ) {
        return c;
      }
    }
    let best: NearbySymbolCandidate | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const c of remainingFull.length > 0 ? remainingFull : candidates) {
      if (
        canvasX >= c.pixelBbox.minX - 3 &&
        canvasX <= c.pixelBbox.maxX + 3 &&
        canvasY >= c.pixelBbox.minY - 3 &&
        canvasY <= c.pixelBbox.maxY + 3
      ) {
        const area =
          (c.pixelBbox.maxX - c.pixelBbox.minX + 1) *
          (c.pixelBbox.maxY - c.pixelBbox.minY + 1);
        if (area < bestArea) {
          best = c;
          bestArea = area;
        }
      }
    }
    return best;
  };

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * srcW;
    const ly = ((e.clientY - rect.top) / rect.height) * srcH;
    const canvasX = x0 + lx;
    const canvasY = y0 + ly;
    const best = hitTest(canvasX, canvasY);
    if (best) {
      setFocusId(best.id);
      return;
    }
    if (!stackMode) {
      onPickPoint({ x: canvasX, y: canvasY });
    }
  };

  const allDone = stackMode && remainingFull.length === 0 && savedIds.size > 0;
  const progressLabel = stackMode
    ? t("projects.aiSetup.marking.loupe.stackProgress", {
        saved: String(savedIds.size),
        total: String(fullCandidates.length),
      })
    : focusCandidate
      ? t("projects.aiSetup.marking.loupe.focusHint", {
          n: String(focusIdx + 1),
        })
      : t("projects.aiSetup.marking.loupe.emptyHint");

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0F2A4D]/50 p-3 sm:p-4"
      role="dialog"
      aria-modal
      aria-label={t("projects.aiSetup.marking.loupe.title")}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
          <div>
            <p className="flex items-center gap-1.5 font-semibold text-[#0F2A4D]">
              {stackMode ? (
                <Layers className="size-4 text-[#E95F2A]" />
              ) : (
                <ZoomIn className="size-4 text-[#E95F2A]" />
              )}
              {stackMode
                ? t("projects.aiSetup.marking.loupe.stackTitle")
                : t("projects.aiSetup.marking.loupe.title")}
            </p>
            <p className="mt-0.5 text-xs text-[#64748B]">
              {stackMode
                ? t("projects.aiSetup.marking.loupe.stackHint")
                : partCandidates.length > 0
                  ? t("projects.aiSetup.marking.loupe.assembleHint")
                  : t("projects.aiSetup.marking.loupe.pickHint")}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F2A4D]"
            onClick={onClose}
            aria-label={t("flyover.close")}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-auto bg-[#EEF2F7] p-3">
          {stackMode && remainingFull.length > 1 ? (
            <div className="flex w-full max-w-md items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => stepFocus(-1)}
                aria-label={t("projects.aiSetup.marking.loupe.prev")}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <p className="text-center text-xs font-medium text-[#0F2A4D]">
                {t("projects.aiSetup.marking.loupe.isolating", {
                  n: String(focusIdx + 1),
                  total: String(fullCandidates.length),
                })}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => stepFocus(1)}
                aria-label={t("projects.aiSetup.marking.loupe.next")}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}

          <canvas
            ref={canvasRef}
            className="cursor-crosshair rounded-lg border border-[#CBD5E1] bg-white shadow-sm"
            style={{
              width: dispW,
              height: dispH,
              maxWidth: "100%",
              imageRendering: "pixelated",
            }}
            onClick={handleCanvasClick}
          />
        </div>

        {candidates.length > 0 ? (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-[#E2E8F0] px-4 py-3">
            {candidates.map((c, i) => {
              const saved = savedIds.has(c.id);
              const focused = c.id === focusId;
              const color = saved ? "#16A34A" : candidateColor(c, i);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={saved}
                  className="inline-flex shrink-0 flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left text-xs transition-colors hover:bg-[#F8FAFC] disabled:opacity-70"
                  style={{
                    borderColor: focused ? color : "#E2E8F0",
                    borderWidth: focused ? 2 : 1,
                    backgroundColor: focused ? `${color}14` : saved ? "#F0FDF4" : "#fff",
                    minWidth: 96,
                  }}
                  onClick={() => !saved && setFocusId(c.id)}
                  aria-pressed={focused}
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color }}>
                    <span
                      className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {saved ? <Check className="size-3" /> : i + 1}
                    </span>
                    {c.partOnly
                      ? t("projects.aiSetup.marking.loupe.part", { n: String(i + 1) })
                      : t("projects.aiSetup.marking.loupe.candidate", {
                          n: String(i + 1),
                        })}
                  </span>
                  <span className="text-[10px] font-medium text-[#64748B]">
                    {saved
                      ? t("projects.aiSetup.marking.loupe.saved")
                      : c.colorHint && c.colorHint !== "unknown"
                        ? String(c.colorHint)
                        : t("projects.aiSetup.marking.loupe.tapToIsolate")}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-col gap-2 border-t border-[#E2E8F0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#64748B]">{progressLabel}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {allDone
                ? t("projects.aiSetup.marking.loupe.done")
                : t("projects.aiSetup.marking.loupe.cancel")}
            </Button>
            {stackMode && remainingFull.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={saveAllRemaining}
              >
                {t("projects.aiSetup.marking.loupe.saveAll", {
                  n: String(remainingFull.length),
                })}
              </Button>
            ) : null}
            {!allDone ? (
              <Button
                type="button"
                size="sm"
                className="bg-[#E95F2A] text-white hover:bg-[#D14F1D]"
                disabled={!focusCandidate || !!focusCandidate.partOnly || savedIds.has(focusCandidate.id)}
                onClick={() => {
                  if (stackMode) saveFocusedAndNext();
                  else if (focusCandidate) saveOne(focusCandidate, false);
                }}
              >
                {stackMode
                  ? t("projects.aiSetup.marking.loupe.saveAndNext")
                  : t("projects.aiSetup.marking.loupe.confirm", { n: "1" })}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
