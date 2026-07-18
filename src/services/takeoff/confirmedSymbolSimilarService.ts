/**
 * Phase 3A — "Find similar" from a confirmed symbol (client orchestrator).
 *
 * Reuses the existing raster template/shape matcher (similarSymbolDetectionService)
 * with the confirmed symbol's bbox as reference, filters matches against
 * existing confirmed symbols and candidates, persists the survivors as
 * probable symbolCandidates (source = template_match) and returns them.
 *
 * Safety: never creates confirmedSymbols, never touches takeoffItems or
 * takeoffEvidence — review/confirm stays with the user.
 */

import { buildSimilarCandidates } from "@/lib/takeoff/findSimilarFromConfirmed";
import {
  attachNearbyTextToCandidates,
  type OcrTextLine,
} from "@/lib/takeoff/ocrNearbyText";
import { attachCandidatePreviewUrls, expandNormalizedRect } from "@/lib/takeoff/takeoffImages";
import type { AnalyzeRegionCandidateDto, SymbolColorLayer } from "@/types/pdfTakeoff";
import {
  getConfirmedSymbol,
  listConfirmedSymbolsForDrawing,
  listSymbolCandidatesForDrawing,
  saveSymbolCandidates,
} from "@/services/takeoff/pdfTakeoffRegionService";
import { findSimilarSymbols } from "@/services/takeoff/similarSymbolDetectionService";
import {
  createCandidatePreviewImage,
  renderPageRaster,
} from "@/services/takeoff/takeoffImageService";
import { runOcrOnRasterRegion } from "@/services/takeoff/ocrAdapter";

export type FindSimilarForConfirmedParams = {
  projectId: string;
  drawingId: string;
  symbolId: string;
  /** Resolved download URL of the drawing PDF. */
  fileUrl: string;
  scope?: "page" | "drawing";
  threshold?: number;
  maxResults?: number;
};

export type FindSimilarForConfirmedResult = {
  candidates: AnalyzeRegionCandidateDto[];
  pagesScanned: number;
  unavailableReason?: "symbol_not_found" | "no_dom" | "render_failed" | "reference_too_small";
};

type SimilarReference = {
  id: string;
  symbolType: string;
  colorLayer: SymbolColorLayer;
  pageNumber: number;
  normalizedPosition: AnalyzeRegionCandidateDto["normalized_position"];
};

/** Color layer for a confirmed symbol (stored candidates carry it; symbols don't). */
export function colorLayerForSymbolType(symbolType: string): SymbolColorLayer {
  const type = symbolType.toLowerCase();
  if (type.includes("socket") || type.includes("zásuv")) return "green";
  if (type.includes("switch") || type.includes("vypína")) return "red";
  if (type.includes("light") || type.includes("led") || type.includes("svetl")) {
    return "orange";
  }
  return "unknown";
}

export async function findSimilarForConfirmedSymbol(
  params: FindSimilarForConfirmedParams
): Promise<FindSimilarForConfirmedResult> {
  const { projectId, drawingId, symbolId, fileUrl, scope = "page", threshold, maxResults } =
    params;

  const symbol = await getConfirmedSymbol(projectId, symbolId);
  if (!symbol) {
    return { candidates: [], pagesScanned: 0, unavailableReason: "symbol_not_found" };
  }

  return runFindSimilarFromReference({
    projectId,
    drawingId,
    fileUrl,
    scope,
    threshold,
    maxResults,
    reference: {
      id: symbol.id,
      symbolType: symbol.symbolType,
      colorLayer: colorLayerForSymbolType(symbol.symbolType),
      pageNumber: symbol.pageNumber,
      normalizedPosition: symbol.normalizedPosition,
    },
  });
}

export type FindSimilarForCandidateParams = {
  projectId: string;
  drawingId: string;
  /** The pending/unconfirmed candidate to use as the visual reference. */
  candidate: AnalyzeRegionCandidateDto;
  fileUrl: string;
  scope?: "page" | "drawing";
  threshold?: number;
  maxResults?: number;
};

/**
 * "Find similar" starting from a candidate that has NOT been confirmed yet.
 * Manual marks and single detections would otherwise have no way to search
 * for the same symbol elsewhere before the operator commits to confirming
 * them — this reuses the exact same matcher/exclusion/persist pipeline as
 * findSimilarForConfirmedSymbol, just skipping the confirmed-symbol lookup.
 */
export async function findSimilarForCandidate(
  params: FindSimilarForCandidateParams
): Promise<FindSimilarForConfirmedResult> {
  const { projectId, drawingId, candidate, fileUrl, scope = "page", threshold, maxResults } =
    params;

  if (!candidate.normalized_position || candidate.page_number == null) {
    return { candidates: [], pagesScanned: 0, unavailableReason: "reference_too_small" };
  }

  return runFindSimilarFromReference({
    projectId,
    drawingId,
    fileUrl,
    scope,
    threshold,
    maxResults,
    reference: {
      id: candidate.id,
      symbolType:
        candidate.label_suggestions[0]?.label ?? colorLayerForSymbolType(candidate.color_layer),
      colorLayer: candidate.color_layer,
      pageNumber: candidate.page_number,
      normalizedPosition: candidate.normalized_position,
    },
  });
}

async function runFindSimilarFromReference(params: {
  projectId: string;
  drawingId: string;
  fileUrl: string;
  scope: "page" | "drawing";
  threshold?: number;
  maxResults?: number;
  reference: SimilarReference;
}): Promise<FindSimilarForConfirmedResult> {
  const { projectId, drawingId, fileUrl, scope, threshold, maxResults, reference } = params;

  // Matching itself is color-aware: the shape matcher keys on the reference
  // symbol's dominant ink color, so sameColorOnly is inherent.
  const matched = await findSimilarSymbols({
    projectId,
    drawingId,
    fileUrl,
    pageNumber: reference.pageNumber,
    referenceBbox: reference.normalizedPosition,
    threshold,
    scanAllPages: scope === "drawing",
  });
  if (matched.unavailableReason) {
    return {
      candidates: [],
      pagesScanned: matched.pagesScanned ?? 0,
      unavailableReason: matched.unavailableReason,
    };
  }

  // Exclusions: everything already confirmed or already suggested/rejected.
  const [confirmedSymbols, existingCandidates] = await Promise.all([
    listConfirmedSymbolsForDrawing(projectId, drawingId),
    listSymbolCandidatesForDrawing(projectId, drawingId),
  ]);

  let candidates = buildSimilarCandidates({
    matches: matched.candidates,
    sourceSymbol: reference,
    confirmedSymbols,
    existingCandidates,
    threshold,
    maxResults,
  });

  if (candidates.length === 0) {
    return { candidates: [], pagesScanned: matched.pagesScanned ?? 1 };
  }

  // Best-effort preview crops — one render per result page.
  const byPage = new Map<number, AnalyzeRegionCandidateDto[]>();
  for (const c of candidates) {
    const page = c.page_number ?? reference.pageNumber;
    byPage.set(page, [...(byPage.get(page) ?? []), c]);
  }
  const previewUrls = new Map<string, string | null>();
  // Phase 3B — OCR only small candidate neighborhoods (never the full page),
  // capped per page to keep the flow responsive. Context only.
  const OCR_NEIGHBORHOOD_LIMIT = 12;
  for (const [page, pageCandidates] of byPage) {
    const rendered = await renderPageRaster(fileUrl, page, 1600).catch(() => null);
    if (!rendered) continue;
    for (const c of pageCandidates) {
      previewUrls.set(
        c.id,
        await createCandidatePreviewImage({
          projectId,
          drawingId,
          candidateId: c.id,
          pageRaster: rendered.raster,
          normalizedPosition: c.normalized_position,
        })
      );
    }

    const ocrLines: OcrTextLine[] = [];
    for (const c of pageCandidates.slice(0, OCR_NEIGHBORHOOD_LIMIT)) {
      const ocr = await runOcrOnRasterRegion({
        pageRaster: rendered.raster,
        regionOnPage: expandNormalizedRect(c.normalized_position, 3),
      }).catch(() => null);
      if (ocr) ocrLines.push(...ocr.lines);
    }
    if (ocrLines.length > 0) {
      const pageWithText = attachNearbyTextToCandidates(
        candidates.filter((x) => (x.page_number ?? reference.pageNumber) === page),
        { fullText: "", lines: ocrLines }
      );
      const byId = new Map(pageWithText.map((x) => [x.id, x]));
      candidates = candidates.map((x) => byId.get(x.id) ?? x);
    }
  }
  candidates = attachCandidatePreviewUrls(candidates, previewUrls);

  // Persist as review-only candidates (no region — template-match origin).
  for (const [page, pageCandidates] of byPage) {
    const withPreviews = candidates.filter((c) =>
      pageCandidates.some((p) => p.id === c.id)
    );
    await saveSymbolCandidates(projectId, null, drawingId, page, withPreviews);
  }

  return { candidates, pagesScanned: matched.pagesScanned ?? 1 };
}
