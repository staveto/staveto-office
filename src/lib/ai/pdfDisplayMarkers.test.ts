import { describe, expect, it } from "vitest";
import {
  buildPdfDisplayMarkers,
  DEFAULT_MARKER_RADIUS_PX,
  isCandidateAnchorId,
  markerCenterFromAnnotation,
  markerSizePx,
  shouldRenderTechnicalBbox,
} from "./pdfDisplayMarkers";
import type { PdfOverlayAnnotation } from "@/types/estimatorPositions";

function ann(partial: Partial<PdfOverlayAnnotation> & Pick<PdfOverlayAnnotation, "id" | "bbox">): PdfOverlayAnnotation {
  return {
    evidenceAnchorId: partial.id.replace("ann_", "anchor_"),
    page: 1,
    label: "E-ZAS-001",
    colorKey: "socket",
    needsReview: false,
    ...partial,
  };
}

describe("pdfDisplayMarkers", () => {
  it("exposes displayBbox from tight symbol for outline rendering", () => {
    const a = ann({
      id: "ann_1",
      bbox: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
      tightSymbolBbox: { x: 0.22, y: 0.23, width: 0.04, height: 0.05 },
    });
    expect(markerCenterFromAnnotation(a)).toEqual({ x: 0.24, y: 0.255 });
    const [marker] = buildPdfDisplayMarkers([a]);
    expect(marker.center).toEqual({ x: 0.24, y: 0.255 });
    expect(marker.displayBbox).toEqual({ x: 0.22, y: 0.23, width: 0.04, height: 0.05 });
    expect(marker.radius).toBe(DEFAULT_MARKER_RADIUS_PX);
  });

  it("falls back to evidence bbox center when tight bbox is missing", () => {
    const a = ann({
      id: "ann_2",
      bbox: { x: 0.2, y: 0.3, width: 0.1, height: 0.08 },
    });
    const center = markerCenterFromAnnotation(a);
    expect(center.x).toBeCloseTo(0.25, 5);
    expect(center.y).toBeCloseTo(0.34, 5);
  });

  it("does not expose filled bbox overlay by default (markers only)", () => {
    const annotations = [
      ann({
        id: "ann_big",
        bbox: { x: 0.05, y: 0.05, width: 0.5, height: 0.5 },
        rawSelectionBbox: { x: 0.05, y: 0.05, width: 0.5, height: 0.5 },
        tightSymbolBbox: { x: 0.24, y: 0.24, width: 0.02, height: 0.02 },
      }),
    ];
    const markers = buildPdfDisplayMarkers(annotations);
    expect(markers).toHaveLength(1);
    expect(markers[0].center.x).toBeLessThan(0.3);
    expect(markers[0].center.y).toBeLessThan(0.3);
    expect(shouldRenderTechnicalBbox(false)).toBe(false);
    expect(shouldRenderTechnicalBbox(true)).toBe(true);
  });

  it("never uses rawSelectionBbox as display marker when tightSymbolBbox exists", () => {
    const raw = { x: 0.05, y: 0.05, width: 0.5, height: 0.5 };
    const tight = { x: 0.24, y: 0.24, width: 0.02, height: 0.02 };
    const a = ann({
      id: "ann_raw",
      bbox: raw,
      rawSelectionBbox: raw,
      tightSymbolBbox: tight,
    });
    const [marker] = buildPdfDisplayMarkers([a]);
    expect(marker!.displayBbox).toEqual(tight);
    expect(marker!.displayBbox).not.toEqual(raw);
    expect(marker!.center).toEqual({ x: 0.25, y: 0.25 });
  });

  it("omits outside-plan marks from display markers", () => {
    const annotations = [
      ann({
        id: "ann_out",
        bbox: { x: 0.8, y: 0.8, width: 0.05, height: 0.05 },
        markStatus: "outside_plan",
      }),
      ann({
        id: "ann_ok",
        bbox: { x: 0.2, y: 0.2, width: 0.03, height: 0.03 },
        markStatus: "confirmed",
      }),
    ];
    const markers = buildPdfDisplayMarkers(annotations);
    expect(markers).toHaveLength(1);
    expect(markers[0].id).toBe("marker_ann_ok");
  });

  it("renders one small marker per similar-symbol candidate", () => {
    const sharedLabel = "E-ZAS-001";
    const annotations = Array.from({ length: 19 }, (_, i) =>
      ann({
        id: `ann_cand_${i}`,
        label: sharedLabel,
        bbox: {
          x: 0.1 + i * 0.02,
          y: 0.2,
          width: 0.08,
          height: 0.08,
        },
        tightSymbolBbox: {
          x: 0.12 + i * 0.02,
          y: 0.22,
          width: 0.015,
          height: 0.015,
        },
      })
    );
    const markers = buildPdfDisplayMarkers(annotations);
    expect(markers).toHaveLength(19);
    expect(new Set(markers.map((m) => m.label))).toEqual(new Set([sharedLabel]));
    for (const m of markers) {
      expect(m.radius).toBe(DEFAULT_MARKER_RADIUS_PX);
    }
  });

  it("flags sim_ anchors as candidates and sizes markers", () => {
    expect(isCandidateAnchorId("sim_abc")).toBe(true);
    expect(isCandidateAnchorId("mark_sim_abc")).toBe(false);
    expect(markerSizePx("medium").minOutline).toBeGreaterThan(markerSizePx("small").minOutline);
    expect(markerSizePx("large").minOutline).toBeGreaterThan(markerSizePx("medium").minOutline);
    const [marker] = buildPdfDisplayMarkers([
      ann({
        id: "ann_sim",
        evidenceAnchorId: "sim_x1",
        bbox: { x: 0.2, y: 0.2, width: 0.02, height: 0.02 },
      }),
    ]);
    expect(marker.isCandidate).toBe(true);
  });
});
