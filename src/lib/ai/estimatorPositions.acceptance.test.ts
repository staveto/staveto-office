/**
 * Evidence-linked positions — acceptance on the real electrical drawing.
 *
 * Builds EstimatorPositions from the fresh Gemini extraction
 * (reports/ai-estimator/fresh-session-facts.json) plus visual symbol
 * detections rendered from fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf.
 *
 * Output: reports/ai-estimator/positions-report.json
 * (positions, anchors, bbox annotations, price/review state, selection sync).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyAnnotationSelection,
  applyManualPriceToPosition,
  buildEstimatorPositionsFromFacts,
  buildPdfOverlayAnnotations,
  positionIdForAnnotation,
  positionsBlockFixedQuote,
  summarizeEstimatorPositions,
} from "./estimatorPositions";
import { foldLegendIntoEstimatorFacts } from "./foldLegendIntoEstimatorFacts";
import { detectSymbolsByColor, type RasterImage } from "./visualSymbolCounter";
import type { AiEstimatorFacts } from "@/types/aiEstimator";

const ROOT = process.cwd();
const PDF = join(ROOT, "fixtures/ai-estimator/08_Znacenie_elektrika_2.pdf");
const FRESH = join(ROOT, "reports/ai-estimator/fresh-session-facts.json");
const OUT = join(ROOT, "reports/ai-estimator/positions-report.json");
const FILE_NAME = "08_Znacenie_elektrika_2.pdf";
const RENDER_SCALE = 3;

async function renderPdfPage(page = 1): Promise<RasterImage> {
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

describe.skipIf(!existsSync(PDF) || !existsSync(FRESH))(
  "evidence-linked positions on the real PDF",
  () => {
    it(
      "creates traceable positions with anchors, bbox annotations and quote safety",
      { timeout: 120_000 },
      async () => {
        const facts = loadFreshFacts()!;
        const image = await renderPdfPage(1);
        const visualDetections = detectSymbolsByColor(image, { page: 1 });

        const positions = buildEstimatorPositionsFromFacts(facts, {
          fileName: FILE_NAME,
          trade: "electrical",
          visualDetections,
          pageSizeByPage: { 1: { width: image.width, height: image.height } },
        });

        // Every position must be able to answer "where did I come from?".
        expect(positions.length).toBeGreaterThan(0);
        for (const p of positions) {
          expect(p.evidenceAnchors.length).toBeGreaterThan(0);
          expect(p.positionCode).toMatch(/^E-[A-Z]{2,3}-\d{3}$/);
          for (const a of p.evidenceAnchors) {
            expect(a.fileName).toBeTruthy();
            expect(a.page).toBeGreaterThan(0);
            expect(["high", "medium", "low"]).toContain(a.confidence);
          }
        }

        const annotations = buildPdfOverlayAnnotations(positions);
        const summary = summarizeEstimatorPositions(positions);
        const safety = positionsBlockFixedQuote(positions);

        // Visual detections give the drawing bbox-linked annotations.
        expect(annotations.length).toBeGreaterThan(0);
        for (const a of annotations) {
          expect(a.bbox.x).toBeGreaterThanOrEqual(0);
          expect(a.bbox.x).toBeLessThanOrEqual(1);
          expect(a.label).toMatch(/^E-/);
        }

        // Selection sync: list row → annotation → back to the position.
        const withBbox = positions.find((p) =>
          p.evidenceAnchors.some((a) => a.bbox != null)
        )!;
        const selected = applyAnnotationSelection(annotations, withBbox.id);
        const mine = selected.filter((a) => a.positionId === withBbox.id);
        expect(mine.length).toBeGreaterThan(0);
        expect(mine.every((a) => a.selected)).toBe(true);
        expect(positionIdForAnnotation(selected, mine[0].id)).toBe(withBbox.id);

        // Price workflow: missing prices block the quote; manual price is applied.
        expect(summary.priceMissing).toBeGreaterThan(0);
        expect(safety.blocked).toBe(true);
        const priced = applyManualPriceToPosition(positions[0], 4.5, "EUR");
        expect(priced.priceStatus).toBe("manual_price");

        mkdirSync(join(ROOT, "reports/ai-estimator"), { recursive: true });
        writeFileSync(
          OUT,
          JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              fileName: FILE_NAME,
              positionsGenerated: positions.length,
              evidenceAnchors: summary.anchors,
              pdfAnnotationsWithBbox: annotations.length,
              rowsWithMissingPrice: summary.priceMissing,
              rowsWithoutBbox: summary.withoutBbox,
              confirmedRows: summary.confirmed,
              rowsNeedingReview: summary.needsReview,
              annotationClickSelectsListItem: true,
              listClickSelectsPdfAnnotation: true,
              priceDrawerHandlesMissingPrice: true,
              fixedQuoteBlocked: safety.blocked,
              blockReasons: safety.reasons,
              positionCodesSample: positions.slice(0, 12).map((p) => ({
                code: p.positionCode,
                label: p.label,
                room: p.roomName ?? null,
                quantity: p.quantity,
                unit: p.unit,
                quantitySource: p.quantitySource,
                anchors: p.evidenceAnchors.length,
                withBbox: p.evidenceAnchors.filter((a) => a.bbox != null).length,
                priceStatus: p.priceStatus,
                reviewStatus: p.reviewStatus,
              })),
              limitations: [
                "Gemini text occurrences carry no bbox yet — only visual detections are drawn on the PDF.",
                "Room assignment for visual detections requires room bounds (not yet extracted).",
              ],
            },
            null,
            2
          ),
          "utf8"
        );
      }
    );
  }
);
