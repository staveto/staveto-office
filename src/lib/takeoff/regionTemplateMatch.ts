/**
 * Analyze Region v2 A1 — run the existing component/shape matcher (used by
 * "Find similar") against project/company symbolTemplates directly inside
 * the analyze-region pipeline.
 *
 * Pure logic only: reuses matchPageByComponents (same matcher as Phase 3A
 * find-similar). Never creates confirmedSymbols/takeoffItems/takeoffEvidence
 * — results are always AnalyzeRegionCandidateDto for human review.
 */

import { matchPageByComponents } from "@/services/takeoff/similarSymbolDetectionService";
import type { RasterImage } from "@/lib/ai/visualSymbolCounter";
import { defaultLabelForSymbolType } from "@/lib/takeoff/candidateReview";
import { normalizedRectToBBoxPdf } from "@/lib/takeoff/regionAnalyzer";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type {
  AnalyzeRegionCandidateDto,
  BBoxPdf,
  BBoxPx,
  SymbolColorLayer,
} from "@/types/pdfTakeoff";

/** Colors the component matcher supports (dark-ink/blue/gray have no shape ref). */
export type TemplateMatchColorLayer = Extract<SymbolColorLayer, "green" | "red" | "orange">;

/** A confirmed-symbol template reduced to its component shape descriptor. */
export type TemplateShapeRef = {
  templateId: string;
  symbolType: string;
  colorLayer: TemplateMatchColorLayer;
  /** SHAPE_GRID² binary mask from similarSymbolDetectionService. */
  refShape: Uint8Array;
  refPxW: number;
  refPxH: number;
};

/** Matches at/above this score are "probable"; below stay "candidate". */
export const TEMPLATE_MATCH_PROBABLE_THRESHOLD = 0.75;
const MAX_RESULTS_PER_TEMPLATE = 30;

/**
 * Match every template against the analyzed region raster and return each
 * hit as an AnalyzeRegionCandidateDto (source = "template_match").
 */
export function matchTemplatesAgainstRegion(params: {
  /** RGBA crop of the analyzed region (same raster passed to analyzeRegionRaster). */
  regionRaster: RasterImage;
  templates: TemplateShapeRef[];
  /** Region placement on the full page in pixels: [x, y, w, h]. */
  regionBboxPx: BBoxPx;
  pageWidthPx: number;
  pageHeightPx: number;
  pageNumber: number;
  pageWidthPt?: number;
  pageHeightPt?: number;
  maxResultsPerTemplate?: number;
}): AnalyzeRegionCandidateDto[] {
  const {
    regionRaster,
    templates,
    regionBboxPx,
    pageWidthPx,
    pageHeightPx,
    pageNumber,
    pageWidthPt,
    pageHeightPt,
    maxResultsPerTemplate = MAX_RESULTS_PER_TEMPLATE,
  } = params;

  const [rx, ry] = regionBboxPx;
  const usePdfPoints =
    typeof pageWidthPt === "number" &&
    pageWidthPt > 0 &&
    typeof pageHeightPt === "number" &&
    pageHeightPt > 0;

  const out: AnalyzeRegionCandidateDto[] = [];
  let seq = 0;

  for (const tpl of templates) {
    // refPxW/refPxH are relative to the template's own crop resolution —
    // component matching gates candidate size by these dims, so a template
    // rendered at a very different DPI than the region would mismatch. That
    // is an acceptable Phase-A1 limitation (documented, not silently wrong).
    const matches = matchPageByComponents({
      pageRaster: regionRaster,
      refShape: tpl.refShape,
      refPxW: tpl.refPxW,
      refPxH: tpl.refPxH,
      color: tpl.colorLayer,
      pageNumber,
    }).slice(0, maxResultsPerTemplate);

    for (const m of matches) {
      // m.normalizedPosition is 0..1 relative to the CROP (regionRaster),
      // not the full page — remap through region origin → page pixels.
      const pagePx: BBoxPx = [
        rx + m.normalizedPosition.x * regionRaster.width,
        ry + m.normalizedPosition.y * regionRaster.height,
        rx + (m.normalizedPosition.x + m.normalizedPosition.width) * regionRaster.width,
        ry + (m.normalizedPosition.y + m.normalizedPosition.height) * regionRaster.height,
      ];
      const normalized: NormalizedRect = {
        x: pagePx[0] / pageWidthPx,
        y: pagePx[1] / pageHeightPx,
        width: (pagePx[2] - pagePx[0]) / pageWidthPx,
        height: (pagePx[3] - pagePx[1]) / pageHeightPx,
      };
      const bboxPdf: BBoxPdf = usePdfPoints
        ? normalizedRectToBBoxPdf(normalized, pageWidthPt!, pageHeightPt!)
        : [
            normalized.x,
            normalized.y,
            normalized.x + normalized.width,
            normalized.y + normalized.height,
          ];
      const confidence = Number(Math.min(0.95, Math.max(0, m.matchScore)).toFixed(3));

      out.push({
        id: `cand_tpl_${tpl.templateId}_${pageNumber}_${seq++}`,
        page_number: pageNumber,
        bbox_pdf: bboxPdf,
        bbox_px: [
          Math.round(pagePx[0] - rx),
          Math.round(pagePx[1] - ry),
          Math.round(pagePx[2] - rx),
          Math.round(pagePx[3] - ry),
        ],
        color_layer: tpl.colorLayer,
        kind: "symbol_candidate",
        label_suggestions: [
          { label: defaultLabelForSymbolType(tpl.symbolType), confidence },
        ],
        nearby_text: null,
        confidence,
        source: "template_match",
        // Only high-confidence matches are "probable" — the rest still
        // surface for review instead of being silently dropped.
        status:
          confidence >= TEMPLATE_MATCH_PROBABLE_THRESHOLD ? "probable" : "candidate",
        preview_image_url: null,
        normalized_position: normalized,
      });
    }
  }

  return out;
}
