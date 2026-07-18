import { describe, expect, it } from "vitest";
import {
  assignDetectionsToRooms,
  bboxIoU,
  classifyPixelColor,
  detectSymbolsByColor,
  detectSymbolsByColorDetailed,
  getSeedVisualTemplates,
  matchVisualTemplate,
  mergeVisualDetectionsWithOccurrences,
  nonMaxSuppression,
  pickTemplateForColor,
  visualDetectionEvidence,
  visualDetectionsToTakeoffRows,
  type RasterImage,
  type VisualSymbolDetection,
  type VisualSymbolTemplate,
} from "./visualSymbolCounter";
import {
  buildEstimatorExtractionQualityReport,
  QUALITY_MSG_SWITCHES_VISUAL_ONLY_SK,
} from "./estimatorExtractionQuality";
import type { AiEstimatorFacts } from "@/types/aiEstimator";

// ---------------------------------------------------------------------------
// synthetic image helpers
// ---------------------------------------------------------------------------

function whiteImage(width: number, height: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  return { width, height, data };
}

function paintRect(
  img: RasterImage,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number]
) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const o = (py * img.width + px) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 255;
    }
  }
}

const RED: [number, number, number] = [220, 30, 30];
const GREEN: [number, number, number] = [40, 170, 60];

function det(partial: Partial<VisualSymbolDetection>): VisualSymbolDetection {
  return {
    id: partial.id ?? `d_${Math.random().toString(36).slice(2, 8)}`,
    normalizedPoint: "switch_point",
    page: 1,
    bbox: { x: 10, y: 10, width: 12, height: 12 },
    matchScore: 0.7,
    source: "color_shape_detection",
    confidence: "medium",
    needsReview: true,
    ...partial,
  };
}

function factsWith(partial: Partial<AiEstimatorFacts>): AiEstimatorFacts {
  return {
    sessionId: "test-session",
    detectedDocumentTypes: ["electrical_marking"],
    inputSummary: "",
    rooms: [],
    extractedItems: [],
    inferredItems: [],
    missingQuestions: [],
    risks: [],
    confidence: "medium",
    warnings: [],
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// color classification + color/shape detection
// ---------------------------------------------------------------------------

describe("color/shape detection", () => {
  it("classifies red/orange/green symbol colors and ignores black text/gray", () => {
    expect(classifyPixelColor(220, 30, 30)).toBe("red");
    expect(classifyPixelColor(240, 140, 40)).toBe("orange");
    expect(classifyPixelColor(40, 170, 60)).toBe("green");
    expect(classifyPixelColor(20, 20, 20)).toBeNull(); // black text
    expect(classifyPixelColor(150, 150, 150)).toBeNull(); // gray dimension line
  });

  it("finds repeated red switch-like symbols with bbox", () => {
    const img = whiteImage(200, 120);
    paintRect(img, 20, 20, 12, 12, RED);
    paintRect(img, 80, 40, 12, 12, RED);
    paintRect(img, 150, 90, 12, 12, RED);

    const detections = detectSymbolsByColor(img, { page: 1 });
    const switches = detections.filter((d) => d.normalizedPoint === "switch_point");
    expect(switches).toHaveLength(3);
    for (const d of switches) {
      expect(d.bbox.width).toBeGreaterThan(0);
      expect(d.bbox.height).toBeGreaterThan(0);
      expect(d.source).toBe("color_shape_detection");
      // Heuristic color detection is never auto-confirmed.
      expect(d.needsReview).toBe(true);
      expect(["medium", "low"]).toContain(d.confidence);
    }
  });

  it("skips elongated blobs (cable/LED/dimension lines)", () => {
    const img = whiteImage(300, 100);
    paintRect(img, 10, 50, 200, 3, RED); // long thin line
    const detections = detectSymbolsByColor(img, { page: 1 });
    expect(detections).toHaveLength(0);
  });

  it("preserves unknown visual symbols for review when no template matches the color", () => {
    const img = whiteImage(100, 100);
    paintRect(img, 30, 30, 12, 12, GREEN);
    const detections = detectSymbolsByColor(img, { page: 1, templates: [] });
    expect(detections).toHaveLength(1);
    expect(detections[0].normalizedPoint).toBe("unknown");
    expect(detections[0].needsReview).toBe(true);
  });
});

describe("detectSymbolsByColorDetailed", () => {
  it("returns the same accepted list as detectSymbolsByColor (no behavior change)", () => {
    const img = whiteImage(200, 120);
    paintRect(img, 20, 20, 12, 12, RED);
    paintRect(img, 80, 40, 12, 12, GREEN);
    const plain = detectSymbolsByColor(img, { page: 1 });
    const detailed = detectSymbolsByColorDetailed(img, { page: 1 });
    expect(detailed.accepted).toEqual(plain);
  });

  it("reports too_small for scattered specks below the size threshold", () => {
    const img = whiteImage(100, 100);
    paintRect(img, 10, 10, 2, 2, GREEN);
    const { accepted, rejected } = detectSymbolsByColorDetailed(img, {
      page: 1,
      minSymbolSizePx: 5,
    });
    expect(accepted).toHaveLength(0);
    expect(rejected.some((r) => r.reason === "too_small" && r.color === "green")).toBe(true);
  });

  it("reports too_large for oversized blobs", () => {
    const img = whiteImage(300, 300);
    paintRect(img, 10, 10, 150, 150, RED);
    const { accepted, rejected } = detectSymbolsByColorDetailed(img, {
      page: 1,
      minSymbolSizePx: 4,
      maxSymbolSizePx: 90,
    });
    expect(accepted).toHaveLength(0);
    expect(rejected.some((r) => r.reason === "too_large")).toBe(true);
  });

  it("reports line_like for elongated blobs (cable/LED/dimension lines)", () => {
    const img = whiteImage(300, 100);
    paintRect(img, 10, 50, 200, 3, RED);
    const { accepted, rejected } = detectSymbolsByColorDetailed(img, {
      page: 1,
      maxSymbolSizePx: 250, // large enough to pass the size gate, not the aspect gate
    });
    expect(accepted).toHaveLength(0);
    expect(rejected.some((r) => r.reason === "line_like" && r.color === "red")).toBe(true);
  });

  /**
   * A 4-connected diagonal "staircase" — a compact (aspect ≈ 1, so it
   * never trips the line_like/aspect filter) but sparse ink pattern, just
   * like a wall corner where hatch strokes cross: real symbols are filled
   * or outlined shapes, not a thin zig-zag scattered over a much larger
   * bounding box.
   */
  function paintStaircase(img: RasterImage, x0: number, y0: number, steps: number, rgb: [number, number, number]) {
    let x = x0;
    let y = y0;
    paintRect(img, x, y, 1, 1, rgb);
    for (let i = 0; i < steps; i++) {
      x += 1;
      paintRect(img, x, y, 1, 1, rgb);
      y += 1;
      paintRect(img, x, y, 1, 1, rgb);
    }
  }

  it("minDensity option defaults to the loose 0.03 threshold (unchanged for existing callers)", () => {
    const img = whiteImage(100, 100);
    paintStaircase(img, 20, 20, 25, RED); // ~0.075 density
    const { accepted } = detectSymbolsByColorDetailed(img, { page: 1, minSymbolSizePx: 4 });
    expect(accepted.length).toBeGreaterThanOrEqual(1);
  });

  it("a stricter minDensity rejects a sparse blob that the loose default would accept", () => {
    const img = whiteImage(100, 100);
    paintStaircase(img, 20, 20, 25, RED); // ~0.075 density
    const { accepted, rejected } = detectSymbolsByColorDetailed(img, {
      page: 1,
      minSymbolSizePx: 4,
      minDensity: 0.12,
    });
    expect(accepted).toHaveLength(0);
    expect(rejected.some((r) => r.reason === "low_density")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// template matching
// ---------------------------------------------------------------------------

describe("template matching", () => {
  it("returns detections with bbox at the template position", () => {
    const img = whiteImage(120, 80);
    // Distinctive pattern: red square with a dark stripe.
    paintRect(img, 60, 30, 14, 14, RED);
    paintRect(img, 60, 36, 14, 3, [10, 10, 10]);

    const tpl = whiteImage(18, 18);
    paintRect(tpl, 2, 2, 14, 14, RED);
    paintRect(tpl, 2, 8, 14, 3, [10, 10, 10]);

    const meta: VisualSymbolTemplate = {
      id: "tpl_legend_switch",
      source: "project_legend",
      trade: "electrical",
      normalizedPoint: "switch_point",
      label: "Vypínač (z legendy)",
      sourcePage: 1,
      confidence: "high",
    };
    const hits = matchVisualTemplate(img, tpl, meta, { page: 1, threshold: 0.7, stride: 1 });
    expect(hits.length).toBeGreaterThan(0);
    const best = hits[0];
    expect(best.templateId).toBe("tpl_legend_switch");
    expect(best.normalizedPoint).toBe("switch_point");
    expect(Math.abs(best.bbox.x - 58)).toBeLessThanOrEqual(4);
    expect(Math.abs(best.bbox.y - 28)).toBeLessThanOrEqual(4);
    expect(best.matchScore).toBeGreaterThan(0.7);
  });

  it("project legend templates win over internal samples", () => {
    const legendTpl: VisualSymbolTemplate = {
      id: "legend_red",
      source: "project_legend",
      trade: "electrical",
      normalizedPoint: "double_socket_point",
      sourcePage: 1,
      colorHint: "red",
      confidence: "high",
    };
    const picked = pickTemplateForColor([...getSeedVisualTemplates(), legendTpl], "red");
    expect(picked?.id).toBe("legend_red");
  });
});

// ---------------------------------------------------------------------------
// dedup / merge
// ---------------------------------------------------------------------------

describe("dedup and merge", () => {
  it("deduplicates overlapping detections keeping the highest score", () => {
    const a = det({ id: "a", bbox: { x: 10, y: 10, width: 12, height: 12 }, matchScore: 0.9 });
    const b = det({ id: "b", bbox: { x: 12, y: 12, width: 12, height: 12 }, matchScore: 0.6 });
    const c = det({ id: "c", bbox: { x: 100, y: 100, width: 12, height: 12 }, matchScore: 0.7 });
    expect(bboxIoU(a.bbox, b.bbox)).toBeGreaterThan(0.3);
    const kept = nonMaxSuppression([a, b, c], 0.3);
    expect(kept.map((d) => d.id).sort()).toEqual(["a", "c"]);
  });

  it("drops visual detections overlapping same-type OCR occurrences (no double-count)", () => {
    const detection = det({ id: "v1", bbox: { x: 10, y: 10, width: 12, height: 12 } });
    const merged = mergeVisualDetectionsWithOccurrences(
      [detection],
      [
        {
          id: "occ1",
          page: 1,
          normalizedType: "switch",
          bbox: { page: 1, x: 11, y: 11, width: 12, height: 12 },
        },
      ]
    );
    expect(merged.detections).toHaveLength(0);
    expect(merged.droppedAsDuplicateOfText).toBe(1);
  });

  it("marks conflicting overlaps as needsReview instead of dropping them", () => {
    const detection = det({
      id: "v1",
      normalizedPoint: "socket_point",
      confidence: "medium",
      needsReview: false,
    });
    const merged = mergeVisualDetectionsWithOccurrences(
      [detection],
      [
        {
          id: "occ1",
          page: 1,
          normalizedType: "switch",
          bbox: { page: 1, x: 11, y: 11, width: 12, height: 12 },
        },
      ]
    );
    expect(merged.conflictsMarkedForReview).toBe(1);
    expect(merged.detections[0].needsReview).toBe(true);
    expect(merged.detections[0].confidence).toBe("low");
  });

  it("assigns detections to rooms by bbox containment", () => {
    const detection = det({ bbox: { x: 50, y: 50, width: 10, height: 10 } });
    const [assigned] = assignDetectionsToRooms(
      [detection],
      [{ roomName: "Spálňa", page: 1, bbox: { x: 0, y: 0, width: 100, height: 100 } }]
    );
    expect(assigned.roomName).toBe("Spálňa");
  });
});

// ---------------------------------------------------------------------------
// quality report integration
// ---------------------------------------------------------------------------

describe("quality report with visual detections", () => {
  it("visual switch detections increase switchesDetectedFromVisual", () => {
    const detections = [det({ id: "v1" }), det({ id: "v2" }), det({ id: "v3" })];
    const { report } = buildEstimatorExtractionQualityReport({
      facts: factsWith({}),
      visualDetections: detections,
    });
    expect(report.switchesDetectedFromText).toBe(0);
    expect(report.switchesDetectedFromVisual).toBe(3);
    expect(report.switchesDetectedTotal).toBe(3);
    expect(report.visualDetectionsCount).toBe(3);
    expect(report.visualDetectionsNeedsReview).toBe(3);
  });

  it("visual-only unconfirmed switches keep the fixed quote blocked with the SK warning", () => {
    const { report, criticalWarnings } = buildEstimatorExtractionQualityReport({
      facts: factsWith({}),
      visualDetections: [det({ id: "v1", needsReview: true })],
    });
    expect(criticalWarnings).toContain(QUALITY_MSG_SWITCHES_VISUAL_ONLY_SK);
    expect(report.missingCriticalCategories).toContain("switches");
    expect(report.fixedQuoteBlocked).toBe(true);
  });

  it("reads visual detections from facts.visualDetections as well", () => {
    const { report } = buildEstimatorExtractionQualityReport({
      facts: factsWith({ visualDetections: [det({ id: "v1" })] }),
    });
    expect(report.switchesDetectedFromVisual).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// takeoff + evidence safety
// ---------------------------------------------------------------------------

describe("takeoff and evidence", () => {
  it("visual-only (unconfirmed) symbols do not create fixed quote lines", () => {
    const rows = visualDetectionsToTakeoffRows([
      det({ id: "v1", confidence: "low" }),
      det({ id: "v2", confidence: "medium" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("switch");
    // No quantity → the row can never be priced as a fixed line.
    expect(rows[0].quantity).toBeUndefined();
    expect(rows[0].needsReview).toBe(true);
    expect(rows[0].source).toBe("visual_detection");
  });

  it("confirmed high-confidence detections get counted quantities", () => {
    const rows = visualDetectionsToTakeoffRows(
      [
        det({ id: "v1", confidence: "high", needsReview: false }),
        det({ id: "v2", confidence: "high", needsReview: false }),
      ],
      { confirmedIds: new Set(["v1", "v2"]) }
    );
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].needsReview).toBe(false);
  });

  it("source evidence contains page, bbox, confidence and needsReview", () => {
    const evidence = visualDetectionEvidence(
      det({ id: "v1", page: 2, bbox: { x: 5, y: 6, width: 7, height: 8 } }),
      "08_Znacenie_elektrika_2.pdf"
    );
    expect(evidence.fileName).toBe("08_Znacenie_elektrika_2.pdf");
    expect(evidence.page).toBe(2);
    expect(["high", "medium", "low"]).toContain(evidence.confidence);
    expect(evidence.needsReview).toBe(true);
    expect(evidence.bbox).toEqual({ page: 2, x: 5, y: 6, width: 7, height: 8 });
  });
});
