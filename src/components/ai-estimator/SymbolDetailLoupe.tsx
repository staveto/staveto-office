"use client";

/**
 * Interactive loupe for dense plan areas.
 * Shows a readable crop framed around nearby symbol parts; the user selects
 * the mark (or assembles parts) and confirms → mark detail.
 */

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Check, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { NearbySymbolCandidate } from "@/lib/ai/pickSymbolFromClick";
import { buildTintedSymbolMask, hexToRgb } from "@/lib/ai/symbolShapeOutline";

const CANDIDATE_COLORS = ["#E95F2A", "#2563EB", "#16A34A", "#DC2626", "#0891B2", "#7C3AED"];
const PART_COLOR = "#64748B";
/** Target CSS size of the preview (keeps symbols readable, not over-pixelated). */
const TARGET_PREVIEW_PX = 420;
const MIN_CROP_HALF = 56;
const MAX_CROP_HALF = 140;
const CROP_PAD_PX = 28;

export type SymbolDetailLoupeProps = {
  /** Full page canvas ImageData (device pixels). */
  imageData: ImageData;
  pageWidth: number;
  pageHeight: number;
  /** Center of the loupe in canvas device pixels. */
  centerCanvasPx: { x: number; y: number };
  candidates: NearbySymbolCandidate[];
  /** Confirm the selected parts as ONE symbol mark. */
  onConfirmCandidates: (candidates: NearbySymbolCandidate[]) => void;
  /** Precise click outside any candidate → canvas device px. */
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
  const x0 = Math.max(0, Math.floor(midX - halfW));
  const y0 = Math.max(0, Math.floor(midY - halfH));
  const x1 = Math.min(pageWidth, Math.ceil(midX + halfW));
  const y1 = Math.min(pageHeight, Math.ceil(midY + halfH));
  return { x0, y0, x1, y1 };
}

function closestCandidateId(
  candidates: NearbySymbolCandidate[],
  center: { x: number; y: number }
): string | null {
  if (candidates.length === 0) return null;
  const full = candidates.filter((c) => !c.partOnly);
  const pool = full.length > 0 ? full : candidates;
  let best = pool[0]!;
  let bestD = Number.POSITIVE_INFINITY;
  for (const c of pool) {
    const cx = (c.pixelBbox.minX + c.pixelBbox.maxX) / 2;
    const cy = (c.pixelBbox.minY + c.pixelBbox.maxY) / 2;
    const d = (cx - center.x) ** 2 + (cy - center.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.id;
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const id = closestCandidateId(candidates, centerCanvasPx);
    return id ? new Set([id]) : new Set();
  });

  const frame = useMemo(
    () => frameLoupeCrop(centerCanvasPx, candidates, pageWidth, pageHeight),
    [centerCanvasPx, candidates, pageWidth, pageHeight]
  );
  const { x0, y0, x1, y1 } = frame;
  const srcW = Math.max(1, x1 - x0);
  const srcH = Math.max(1, y1 - y0);
  // Fit into a readable preview box — avoid 5× on a tiny 48px crop.
  const zoom = Math.max(
    2,
    Math.min(5, Math.floor(TARGET_PREVIEW_PX / Math.max(srcW, srcH)))
  );
  const dispW = Math.round(srcW * zoom);
  const dispH = Math.round(srcH * zoom);

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds]
  );

  const candidateColor = (c: NearbySymbolCandidate, i: number): string =>
    c.partOnly ? PART_COLOR : CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]!;

  const toggleCandidate = (c: NearbySymbolCandidate) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) {
        next.delete(c.id);
        return next;
      }
      // Full marks: single-select (disambiguation). Parts: multi-select (assemble).
      if (!c.partOnly) {
        for (const other of candidates) {
          if (!other.partOnly) next.delete(other.id);
        }
      }
      next.add(c.id);
      return next;
    });
  };

  const confirmSelection = (list?: NearbySymbolCandidate[]) => {
    const chosen = list ?? selectedCandidates;
    if (chosen.length === 0) return;
    onConfirmCandidates(chosen);
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

    // Crosshair at original click — orientation for the user.
    const clickDx = (centerCanvasPx.x - x0) * zoom;
    const clickDy = (centerCanvasPx.y - y0) * zoom;
    ctx.save();
    ctx.strokeStyle = "rgba(15, 42, 77, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(clickDx, 0);
    ctx.lineTo(clickDx, dispH);
    ctx.moveTo(0, clickDy);
    ctx.lineTo(dispW, clickDy);
    ctx.stroke();
    ctx.restore();

    candidates.forEach((c, i) => {
      const selected = selectedIds.has(c.id);
      const color = selected ? "#16A34A" : candidateColor(c, i);
      const tint = hexToRgb(color);
      const mask = buildTintedSymbolMask(
        imageData,
        c.pixelBbox,
        pageWidth,
        pageHeight,
        tint,
        { padPx: 1, alpha: selected ? 220 : hoverIdx === i ? 200 : 120 }
      );
      if (mask) {
        const off = document.createElement("canvas");
        off.width = mask.width;
        off.height = mask.height;
        const octx = off.getContext("2d");
        if (octx) {
          octx.putImageData(mask.imageData, 0, 0);
          const dx = (mask.canvasX - x0) * zoom;
          const dy = (mask.canvasY - y0) * zoom;
          ctx.drawImage(off, dx, dy, mask.width * zoom, mask.height * zoom);
        }
      } else {
        const bx = (c.pixelBbox.minX - x0) * zoom;
        const by = (c.pixelBbox.minY - y0) * zoom;
        const bw = (c.pixelBbox.maxX - c.pixelBbox.minX + 1) * zoom;
        const bh = (c.pixelBbox.maxY - c.pixelBbox.minY + 1) * zoom;
        ctx.strokeStyle = color;
        ctx.lineWidth = selected ? 3 : 2;
        ctx.strokeRect(bx, by, bw, bh);
      }
      drawBadge(ctx, c, i, selected, color);
    });
  }, [
    imageData,
    pageWidth,
    pageHeight,
    candidates,
    hoverIdx,
    selectedIds,
    dispW,
    dispH,
    srcW,
    srcH,
    x0,
    y0,
    zoom,
    centerCanvasPx.x,
    centerCanvasPx.y,
  ]);

  function drawBadge(
    ctx: CanvasRenderingContext2D,
    c: NearbySymbolCandidate,
    i: number,
    selected: boolean,
    color: string
  ) {
    const cx = ((c.pixelBbox.minX + c.pixelBbox.maxX) / 2 - x0) * zoom;
    const cy = ((c.pixelBbox.minY + c.pixelBbox.maxY) / 2 - y0) * zoom;
    ctx.beginPath();
    ctx.arc(cx, cy, selected || hoverIdx === i ? 15 : 12, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(selected ? "✓" : String(i + 1), cx, cy + 0.5);
  }

  const hitTest = (canvasX: number, canvasY: number): NearbySymbolCandidate | null => {
    let best: NearbySymbolCandidate | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
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
      toggleCandidate(best);
      return;
    }
    // Empty area → place mark at exact click (opens detail).
    onPickPoint({ x: canvasX, y: canvasY });
  };

  const handleCanvasDoubleClick = (e: MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * srcW;
    const ly = ((e.clientY - rect.top) / rect.height) * srcH;
    const best = hitTest(x0 + lx, y0 + ly);
    if (best) {
      confirmSelection([best]);
      return;
    }
    if (selectedCandidates.length > 0) confirmSelection();
  };

  const hasParts = candidates.some((c) => c.partOnly);
  const hintText =
    selectedCandidates.length > 0
      ? t("projects.aiSetup.marking.loupe.selectedCount", {
          n: String(selectedCandidates.length),
        })
      : candidates.length > 0
        ? t("projects.aiSetup.marking.loupe.hint", {
            count: String(candidates.length),
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
              <ZoomIn className="size-4 text-[#E95F2A]" />
              {t("projects.aiSetup.marking.loupe.title")}
            </p>
            <p className="mt-0.5 text-xs text-[#64748B]">
              {hasParts
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

        <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-[#EEF2F7] p-3">
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
            onDoubleClick={handleCanvasDoubleClick}
          />
        </div>

        {candidates.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-[#E2E8F0] px-4 py-3">
            {candidates.map((c, i) => {
              const selected = selectedIds.has(c.id);
              const color = selected ? "#16A34A" : candidateColor(c, i);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
                  style={{
                    borderColor: color,
                    color,
                    backgroundColor: selected ? "#F0FDF4" : undefined,
                  }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => toggleCandidate(c)}
                  onDoubleClick={() => confirmSelection([c])}
                  aria-pressed={selected}
                >
                  <span
                    className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {selected ? <Check className="size-3" /> : i + 1}
                  </span>
                  {c.partOnly
                    ? t("projects.aiSetup.marking.loupe.part", { n: String(i + 1) })
                    : t("projects.aiSetup.marking.loupe.candidate", {
                        n: String(i + 1),
                      })}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-col gap-2 border-t border-[#E2E8F0] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#64748B]">{hintText}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t("projects.aiSetup.marking.loupe.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#E95F2A] text-white hover:bg-[#D14F1D]"
              disabled={selectedCandidates.length === 0}
              onClick={() => confirmSelection()}
            >
              {selectedCandidates.length === 0
                ? t("projects.aiSetup.marking.loupe.confirmEmpty")
                : t("projects.aiSetup.marking.loupe.confirm", {
                    n: String(selectedCandidates.length),
                  })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
