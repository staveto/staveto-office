"use client";

/**
 * Interactive loupe for dense plan areas.
 * Shows a magnified crop; user clicks the exact symbol (or a numbered candidate).
 */

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nContext";
import type { NearbySymbolCandidate } from "@/lib/ai/pickSymbolFromClick";
import { buildTintedSymbolMask, hexToRgb } from "@/lib/ai/symbolShapeOutline";

const CANDIDATE_COLORS = ["#E95F2A", "#2563EB", "#16A34A", "#DC2626", "#0891B2", "#7C3AED"];

export type SymbolDetailLoupeProps = {
  /** Full page canvas ImageData (device pixels). */
  imageData: ImageData;
  pageWidth: number;
  pageHeight: number;
  /** Center of the loupe in canvas device pixels. */
  centerCanvasPx: { x: number; y: number };
  candidates: NearbySymbolCandidate[];
  /** Magnification of the crop. */
  zoom?: number;
  /** Half-size of the source crop in canvas px. */
  cropRadiusPx?: number;
  onPickCandidate: (candidate: NearbySymbolCandidate) => void;
  /** Precise click inside loupe → canvas device px. */
  onPickPoint: (canvasPx: { x: number; y: number }) => void;
  onClose: () => void;
};

export function SymbolDetailLoupe({
  imageData,
  pageWidth,
  pageHeight,
  centerCanvasPx,
  candidates,
  zoom = 5,
  cropRadiusPx = 48,
  onPickCandidate,
  onPickPoint,
  onClose,
}: SymbolDetailLoupeProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const x0 = Math.max(0, Math.floor(centerCanvasPx.x - cropRadiusPx));
  const y0 = Math.max(0, Math.floor(centerCanvasPx.y - cropRadiusPx));
  const x1 = Math.min(pageWidth, Math.ceil(centerCanvasPx.x + cropRadiusPx));
  const y1 = Math.min(pageHeight, Math.ceil(centerCanvasPx.y + cropRadiusPx));
  const srcW = Math.max(1, x1 - x0);
  const srcH = Math.max(1, y1 - y0);
  const dispW = Math.round(srcW * zoom);
  const dispH = Math.round(srcH * zoom);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dispW;
    canvas.height = dispH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw magnified crop (nearest-neighbour = crisp lines).
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
    ctx.drawImage(tmp, 0, 0, dispW, dispH);

    // Overlay each candidate's ink + numbered ring.
    candidates.forEach((c, i) => {
      const color = CANDIDATE_COLORS[i % CANDIDATE_COLORS.length]!;
      const tint = hexToRgb(color);
      const mask = buildTintedSymbolMask(
        imageData,
        c.pixelBbox,
        pageWidth,
        pageHeight,
        tint,
        { padPx: 1, alpha: hoverIdx === i ? 230 : 160 }
      );
      if (mask) {
        const img = new Image();
        img.onload = () => {
          const dx = (mask.canvasX - x0) * zoom;
          const dy = (mask.canvasY - y0) * zoom;
          ctx.drawImage(img, dx, dy, mask.width * zoom, mask.height * zoom);
        };
        img.src = mask.dataUrl;
      }
      const cx = ((c.pixelBbox.minX + c.pixelBbox.maxX) / 2 - x0) * zoom;
      const cy = ((c.pixelBbox.minY + c.pixelBbox.maxY) / 2 - y0) * zoom;
      ctx.beginPath();
      ctx.arc(cx, cy, hoverIdx === i ? 14 : 11, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), cx, cy);
    });
  }, [
    imageData,
    pageWidth,
    pageHeight,
    candidates,
    hoverIdx,
    dispW,
    dispH,
    srcW,
    srcH,
    x0,
    y0,
    zoom,
  ]);

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * srcW;
    const ly = ((e.clientY - rect.top) / rect.height) * srcH;
    const canvasX = x0 + lx;
    const canvasY = y0 + ly;

    // If click lands inside a candidate, pick that candidate.
    for (const c of candidates) {
      if (
        canvasX >= c.pixelBbox.minX - 2 &&
        canvasX <= c.pixelBbox.maxX + 2 &&
        canvasY >= c.pixelBbox.minY - 2 &&
        canvasY <= c.pixelBbox.maxY + 2
      ) {
        onPickCandidate(c);
        return;
      }
    }
    onPickPoint({ x: canvasX, y: canvasY });
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0F2A4D]/45 p-4"
      role="dialog"
      aria-modal
      aria-label={t("projects.aiSetup.marking.loupe.title")}
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
          <div>
            <p className="flex items-center gap-1.5 font-semibold text-[#0F2A4D]">
              <ZoomIn className="size-4 text-[#E95F2A]" />
              {t("projects.aiSetup.marking.loupe.title")}
            </p>
            <p className="mt-0.5 text-xs text-[#64748B]">
              {t("projects.aiSetup.marking.loupe.hint", {
                count: String(candidates.length),
              })}
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

        <div className="flex justify-center bg-[#EEF2F7] p-3">
          <canvas
            ref={canvasRef}
            className="cursor-crosshair rounded-lg border border-[#CBD5E1] bg-white shadow-sm"
            style={{ width: dispW, height: dispH, maxWidth: "100%" }}
            onClick={handleCanvasClick}
          />
        </div>

        {candidates.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-t border-[#E2E8F0] px-4 py-3">
            {candidates.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[#F8FAFC]"
                style={{
                  borderColor: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
                  color: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
                }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onPickCandidate(c)}
              >
                <span
                  className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
                  }}
                >
                  {i + 1}
                </span>
                {t("projects.aiSetup.marking.loupe.candidate", {
                  n: String(i + 1),
                })}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-[#E2E8F0] px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("projects.aiSetup.marking.loupe.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}
