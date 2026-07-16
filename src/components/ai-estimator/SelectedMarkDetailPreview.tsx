"use client";

/**
 * High-contrast crop preview for the selected PDF mark — inspect without
 * zooming the whole plan to 400%.
 */

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nContext";
import { captureMarkCrop } from "@/lib/ai/markCropCapture";
import { similarCandidateAnchors } from "@/lib/ai/estimatorPositions";
import type { EstimatorPosition } from "@/types/estimatorPositions";
import { cn } from "@/lib/utils";

type Props = {
  position: EstimatorPosition | null;
  fileUrl: string | null;
  selectedAnchorId?: string | null;
};

export function SelectedMarkDetailPreview({
  position,
  fileUrl,
  selectedAnchorId,
}: Props) {
  const { t } = useI18n();
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const anchor = position
    ? (selectedAnchorId
        ? position.evidenceAnchors.find((a) => a.id === selectedAnchorId)
        : null) ??
      [...position.evidenceAnchors].reverse().find((a) => a.bbox) ??
      null
    : null;

  useEffect(() => {
    let cancelled = false;
    if (!position || !fileUrl || !anchor?.bbox) {
      setCropUrl(null);
      return;
    }
    setBusy(true);
    void captureMarkCrop({
      fileUrl,
      page: anchor.page,
      bbox: anchor.tightSymbolBbox ?? anchor.bbox,
    })
      .then((crop) => {
        if (cancelled) return;
        setCropUrl(`data:${crop.mimeType};base64,${crop.base64}`);
      })
      .catch(() => {
        if (!cancelled) setCropUrl(null);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [position?.id, fileUrl, anchor?.id, anchor?.bbox, anchor?.tightSymbolBbox, anchor?.page]);

  if (!position || !anchor?.bbox) return null;

  const candidates = similarCandidateAnchors(position).length;
  const status =
    candidates > 0
      ? t("projects.aiSetup.marking.filter.candidates")
      : position.reviewStatus === "needs_review" || anchor.needsReview
        ? t("projects.aiSetup.marking.filter.needsReview")
        : t("projects.aiSetup.positions.review.confirmed");

  return (
    <div className="rounded-xl border border-[#1D376A]/25 bg-white p-2.5 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#1D376A]">
        {t("projects.aiSetup.marking.detailPreviewTitle")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#0F2A4D]">
          {busy && !cropUrl ? (
            <p className="px-2 py-8 text-center text-[10px] text-white/70">
              {t("common.loading")}
            </p>
          ) : cropUrl ? (
            <img
              src={cropUrl}
              alt=""
              className="mx-auto h-28 w-full object-contain"
              style={{ imageRendering: "pixelated", transform: "scale(1.15)" }}
            />
          ) : (
            <p className="px-2 py-8 text-center text-[10px] text-white/70">—</p>
          )}
          <p className="bg-[#0F2A4D] px-1.5 py-0.5 text-center text-[9px] font-semibold text-white/80">
            {t("projects.aiSetup.marking.detailPreviewContrast")}
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F8FAFC]">
          {cropUrl ? (
            <img
              src={cropUrl}
              alt=""
              className="mx-auto h-28 w-full object-contain"
            />
          ) : (
            <p className="px-2 py-8 text-center text-[10px] text-[#94A3B8]">—</p>
          )}
          <p className="bg-[#F1F5F9] px-1.5 py-0.5 text-center text-[9px] font-semibold text-[#64748B]">
            {t("projects.aiSetup.marking.detailPreviewOriginal")}
          </p>
        </div>
      </div>
      <div className="space-y-0.5 text-xs">
        <p className="font-semibold text-[#0F2A4D] truncate">{position.label}</p>
        <p className="font-mono text-[10px] text-[#64748B]">{position.positionCode}</p>
        <p className="text-[#475569]">
          {position.quantity} {position.unit === "unknown" ? "ks" : position.unit}
          {" · "}
          <span
            className={cn(
              "font-semibold",
              candidates > 0 || position.reviewStatus === "needs_review"
                ? "text-amber-700"
                : "text-emerald-700"
            )}
          >
            {status}
          </span>
        </p>
      </div>
    </div>
  );
}
