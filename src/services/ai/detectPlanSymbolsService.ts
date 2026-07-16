/**
 * detectPlanSymbolsService — client wrapper for the detectPlanSymbols callable.
 *
 * Encodes canvas regions as compact images, calls Gemini vision detection and
 * maps the returned boxes back into full-canvas normalized coordinates.
 */

import { getAiCallable } from "@/lib/firebase";
import type { EstimatorPositionBBox } from "@/types/estimatorPositions";
import {
  clickCropRect,
  clickWithinCrop,
  dedupeDetections,
  isPlausibleSymbolBox,
  mapCropBboxToCanvas,
  pageTileRects,
  type AiDetectedSymbol,
  type PixelRect,
} from "@/lib/ai/aiSymbolDetection";

export type { AiDetectedSymbol };

type DetectRequest = {
  imageBase64: string;
  mimeType: "image/png" | "image/jpeg";
  mode: "click" | "all";
  click?: { x: number; y: number };
  language?: "sk" | "de" | "en";
  legendEntries?: Array<{ label?: string; description: string }>;
  maxSymbols?: number;
};

type DetectResponse = {
  symbols: Array<{
    bbox: EstimatorPositionBBox;
    name: string;
    category: string;
    confidence: "high" | "medium" | "low";
  }>;
};

async function callDetect(req: DetectRequest): Promise<DetectResponse["symbols"]> {
  const callable = getAiCallable<DetectRequest, DetectResponse>("detectPlanSymbols");
  const res = await callable(req);
  const symbols = res.data?.symbols;
  return Array.isArray(symbols) ? symbols : [];
}

/** Max edge sent to the model — detection stays accurate, tokens stay low. */
const CLICK_SEND_MAX_PX = 640;
const TILE_SEND_MAX_PX = 1536;

function encodeRegion(
  source: ImageData,
  region: PixelRect,
  sendMaxPx: number,
  mimeType: "image/png" | "image/jpeg"
): string | null {
  if (typeof document === "undefined") return null;
  const src = document.createElement("canvas");
  src.width = source.width;
  src.height = source.height;
  const srcCtx = src.getContext("2d");
  if (!srcCtx) return null;
  srcCtx.putImageData(source, 0, 0);

  const scale = Math.min(1, sendMaxPx / Math.max(region.width, region.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(region.width * scale));
  out.height = Math.max(1, Math.round(region.height * scale));
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, out.width, out.height);
  outCtx.drawImage(
    src,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    out.width,
    out.height
  );
  const dataUrl =
    mimeType === "image/jpeg" ? out.toDataURL("image/jpeg", 0.85) : out.toDataURL("image/png");
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : null;
}

export type DetectSymbolAtPointResult = {
  /** Normalized full-canvas bbox of the complete symbol (displayed space). */
  bbox: EstimatorPositionBBox;
  name: string;
  category: string;
  confidence: "high" | "medium" | "low";
} | null;

/**
 * AI definition of the ONE symbol at a clicked point.
 * Returns null when the model sees no symbol near the click.
 */
export async function detectSymbolAtCanvasPoint(input: {
  imageData: ImageData;
  clickCanvasPx: { x: number; y: number };
  language?: "sk" | "de" | "en";
  legendEntries?: Array<{ label?: string; description: string }>;
}): Promise<DetectSymbolAtPointResult> {
  const { imageData, clickCanvasPx } = input;
  const crop = clickCropRect(clickCanvasPx, imageData.width, imageData.height);
  const base64 = encodeRegion(imageData, crop, CLICK_SEND_MAX_PX, "image/png");
  if (!base64) return null;

  const symbols = await callDetect({
    imageBase64: base64,
    mimeType: "image/png",
    mode: "click",
    click: clickWithinCrop(clickCanvasPx, crop),
    language: input.language ?? "sk",
    legendEntries: input.legendEntries,
    maxSymbols: 1,
  });
  const first = symbols[0];
  if (!first) return null;

  const bbox = mapCropBboxToCanvas(first.bbox, crop, imageData.width, imageData.height);
  if (bbox.width <= 0 || bbox.height <= 0) return null;
  return {
    bbox,
    name: first.name,
    category: first.category,
    confidence: first.confidence,
  };
}

/**
 * AI detection of ALL symbols on the current page canvas.
 * Large pages are tiled; detections are merged and deduplicated.
 */
export async function detectAllSymbolsOnCanvas(input: {
  imageData: ImageData;
  language?: "sk" | "de" | "en";
  legendEntries?: Array<{ label?: string; description: string }>;
}): Promise<AiDetectedSymbol[]> {
  const { imageData } = input;
  const tiles = pageTileRects(imageData.width, imageData.height);

  const perTile = await Promise.all(
    tiles.map(async (tile) => {
      const base64 = encodeRegion(imageData, tile, TILE_SEND_MAX_PX, "image/jpeg");
      if (!base64) return [] as AiDetectedSymbol[];
      try {
        const symbols = await callDetect({
          imageBase64: base64,
          mimeType: "image/jpeg",
          mode: "all",
          language: input.language ?? "sk",
          legendEntries: input.legendEntries,
          maxSymbols: 120,
        });
        return symbols
          .map((s) => ({
            bbox: mapCropBboxToCanvas(s.bbox, tile, imageData.width, imageData.height),
            name: s.name,
            category: s.category,
            confidence: s.confidence,
          }))
          .filter((s) => isPlausibleSymbolBox(s.bbox));
      } catch {
        // One failed tile must not kill the whole page scan.
        return [] as AiDetectedSymbol[];
      }
    })
  );

  return dedupeDetections(perTile.flat());
}
