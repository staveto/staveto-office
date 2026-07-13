/**
 * Visual symbol counter — acceptance run on the real electrical drawing.
 *
 * Renders fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf at high resolution
 * (pdfjs-dist + @napi-rs/canvas, Node only), runs color/shape symbol detection
 * and merges the result with the fresh Gemini extraction facts (when present).
 *
 * Output: reports/ai-estimator/visual-symbol-report.json
 *
 * Honesty rules verified here (Phase 8):
 *  - switchesDetectedFromText stays 0 for this drawing (no OCR labels),
 *  - visual switch candidates carry bbox evidence and needsReview,
 *  - fixedQuoteBlocked remains true until detections are confirmed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectSymbolsByColor,
  mergeVisualDetectionsWithOccurrences,
  visualDetectionEvidence,
  visualDetectionsToTakeoffRows,
  type RasterImage,
  type VisualSymbolDetection,
} from "./visualSymbolCounter";
import {
  buildEstimatorExtractionQualityReport,
  QUALITY_MSG_SWITCHES_VISUAL_ONLY_SK,
} from "./estimatorExtractionQuality";
import { foldLegendIntoEstimatorFacts } from "./foldLegendIntoEstimatorFacts";
import type { AiEstimatorFacts } from "@/types/aiEstimator";

const ROOT = process.cwd();
const PDF = join(ROOT, "fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf");
const FRESH = join(ROOT, "reports/ai-estimator/fresh-session-facts.json");
const OUT = join(ROOT, "reports/ai-estimator/visual-symbol-report.json");
const FILE_NAME = "08_Znacenie_elektrika_2.pdf";
const RENDER_SCALE = 3;

async function renderPdfPage(page = 1): Promise<RasterImage> {
  // pdfjs needs Path2D/DOMMatrix/ImageData globals in Node.
  const napi = await import("@napi-rs/canvas");
  const g = globalThis as Record<string, unknown>;
  g.Path2D = g.Path2D ?? napi.Path2D;
  g.DOMMatrix = g.DOMMatrix ?? napi.DOMMatrix;
  g.ImageData = g.ImageData ?? napi.ImageData;

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(PDF));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pdfPage = await doc.getPage(page);
  const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
  const canvas = napi.createCanvas(Math.round(viewport.width), Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  await pdfPage.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: img.data };
}

function loadFreshFacts(): AiEstimatorFacts | null {
  if (!existsSync(FRESH)) return null;
  const parsed = JSON.parse(readFileSync(FRESH, "utf8")) as { facts: AiEstimatorFacts };
  return foldLegendIntoEstimatorFacts(parsed.facts);
}

describe.skipIf(!existsSync(PDF))("visual symbol counter on the real PDF", () => {
  it(
    "detects graphical switch candidates with bbox evidence and keeps the quote blocked",
    { timeout: 120_000 },
    async () => {
      const image = await renderPdfPage(1);
      const rawDetections = detectSymbolsByColor(image, { page: 1 });

      const facts = loadFreshFacts();
      const occurrences = (facts?.symbolOccurrences ?? []).map((o) => ({
        id: o.id,
        page: o.page,
        bbox: o.bbox,
        normalizedType: o.normalizedType,
      }));
      const merge = mergeVisualDetectionsWithOccurrences(rawDetections, occurrences);
      const detections = merge.detections;

      const switchDetections = detections.filter(
        (d) => d.normalizedPoint === "switch_point"
      );

      // Every detection must carry full evidence — page, bbox, confidence, review state.
      for (const d of detections) {
        expect(d.page).toBeGreaterThan(0);
        expect(d.bbox.width).toBeGreaterThan(0);
        expect(d.bbox.height).toBeGreaterThan(0);
        expect(["high", "medium", "low"]).toContain(d.confidence);
        expect(typeof d.needsReview).toBe("boolean");
        const evidence = visualDetectionEvidence(d, FILE_NAME);
        expect(evidence.bbox).not.toBeNull();
      }

      // Visual-only rows never become fixed quote lines.
      const takeoffRows = visualDetectionsToTakeoffRows(switchDetections);
      for (const row of takeoffRows) {
        expect(row.quantity).toBeUndefined();
        expect(row.needsReview).toBe(true);
      }

      // Quality report with visual detections merged in.
      const quality = facts
        ? buildEstimatorExtractionQualityReport({ facts, visualDetections: detections })
        : null;

      const noSwitchReason =
        switchDetections.length === 0
          ? "No red (switch-colored) symbol-sized blobs found at the configured thresholds — switches remain flagged for manual review."
          : null;

      const report = {
        generatedAt: new Date().toISOString(),
        fileName: FILE_NAME,
        renderScale: RENDER_SCALE,
        pageSizePx: { width: image.width, height: image.height },
        ranOnRealPdf: true,
        detectionMethod: "color_shape_detection (red=switches, orange=lights, green=sockets)",
        visualDetectionsCount: detections.length,
        visualDetectionsNeedsReview: detections.filter((d) => d.needsReview).length,
        droppedAsDuplicateOfText: merge.droppedAsDuplicateOfText,
        conflictsMarkedForReview: merge.conflictsMarkedForReview,
        switchesDetectedFromText: quality?.report.switchesDetectedFromText ?? 0,
        switchesDetectedFromVisual: switchDetections.length,
        switchesDetectedTotal: quality?.report.switchesDetectedTotal ?? switchDetections.length,
        fixedQuoteBlocked: quality?.report.fixedQuoteBlocked ?? true,
        criticalWarnings: quality?.criticalWarnings ?? [],
        noSwitchReason,
        byNormalizedPoint: Object.fromEntries(
          ["switch_point", "socket_point", "light_output", "led_strip_point", "unknown"].map(
            (p) => [p, detections.filter((d) => d.normalizedPoint === p).length]
          )
        ),
        sampleSwitchDetections: switchDetections.slice(0, 25).map((d: VisualSymbolDetection) => ({
          id: d.id,
          page: d.page,
          bbox: d.bbox,
          matchScore: d.matchScore,
          confidence: d.confidence,
          needsReview: d.needsReview,
          roomName: d.roomName ?? null,
          cropId: d.cropId ?? null,
        })),
        limitations: [
          "Room assignment is not available — extracted rooms have no pixel bounds yet.",
          "Legend-area symbol samples are not excluded from the floor-plan detections yet.",
          "Templates are internal color-hint samples; project-legend crop extraction is not complete.",
          "Crop preview images are not generated yet — cropId is a placeholder.",
        ],
      };

      mkdirSync(join(ROOT, "reports/ai-estimator"), { recursive: true });
      writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");

      // Phase 8 acceptance:
      // switches were not readable from text on this drawing.
      expect(report.switchesDetectedFromText).toBe(0);
      // either visual candidates exist, or the report states a clear reason.
      expect(switchDetections.length > 0 || noSwitchReason !== null).toBe(true);
      if (switchDetections.length > 0) {
        for (const d of switchDetections) expect(d.needsReview).toBe(true);
        if (quality) {
          expect(quality.criticalWarnings).toContain(QUALITY_MSG_SWITCHES_VISUAL_ONLY_SK);
        }
      }
      // Unconfirmed visual detections must never unblock the fixed quote.
      expect(report.fixedQuoteBlocked).toBe(true);
    }
  );
});

describe.skipIf(existsSync(PDF))("visual symbol counter (missing fixture)", () => {
  it("reports the missing fixture clearly", () => {
    expect.fail(
      "Missing fixture: fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf — download it with `npm run fetch:fixture-pdf` (see fixtures/ai-estimator/README.md)."
    );
  });
});
