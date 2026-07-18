import { describe, expect, it } from "vitest";
import {
  CANDIDATE_PREVIEW_PADDING,
  EVIDENCE_CONTEXT_PADDING,
  TEMPLATE_PADDING,
  attachCandidatePreviewUrls,
  chooseEvidenceImageUrl,
  expandNormalizedRect,
  normalizedRectToPixelCrop,
  takeoffImageStoragePath,
} from "./takeoffImages";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";

describe("takeoffImageStoragePath", () => {
  it("builds the four takeoff image paths", () => {
    expect(
      takeoffImageStoragePath({
        projectId: "p1",
        drawingId: "d1",
        kind: "candidates",
        id: "cand_abc",
      })
    ).toBe("projects/p1/drawings/d1/takeoff/candidates/cand_abc.png");
    expect(
      takeoffImageStoragePath({ projectId: "p1", drawingId: "d1", kind: "evidence", id: "csym_1" })
    ).toBe("projects/p1/drawings/d1/takeoff/evidence/csym_1.png");
    expect(
      takeoffImageStoragePath({ projectId: "p1", drawingId: "d1", kind: "templates", id: "tmpl-1" })
    ).toBe("projects/p1/drawings/d1/takeoff/templates/tmpl-1.png");
    expect(
      takeoffImageStoragePath({ projectId: "p1", drawingId: "d1", kind: "regions", id: "reg_1" })
    ).toBe("projects/p1/drawings/d1/takeoff/regions/reg_1.png");
  });

  it("rejects path traversal and unsafe segments", () => {
    expect(() =>
      takeoffImageStoragePath({ projectId: "p1", drawingId: "d1", kind: "evidence", id: "../x" })
    ).toThrow("INVALID_STORAGE_PATH_SEGMENT:id");
    expect(() =>
      takeoffImageStoragePath({ projectId: "a/b", drawingId: "d1", kind: "evidence", id: "x" })
    ).toThrow("INVALID_STORAGE_PATH_SEGMENT:projectId");
    expect(() =>
      takeoffImageStoragePath({ projectId: "p1", drawingId: "", kind: "evidence", id: "x" })
    ).toThrow("INVALID_STORAGE_PATH_SEGMENT:drawingId");
  });
});

describe("expandNormalizedRect", () => {
  it("pads on every side by a ratio of the rect size", () => {
    const padded = expandNormalizedRect(
      { x: 0.4, y: 0.4, width: 0.1, height: 0.2 },
      0.5
    );
    expect(padded.x).toBeCloseTo(0.35);
    expect(padded.y).toBeCloseTo(0.3);
    expect(padded.width).toBeCloseTo(0.2);
    expect(padded.height).toBeCloseTo(0.4);
  });

  it("clamps padding to page bounds (0..1)", () => {
    const padded = expandNormalizedRect(
      { x: 0.01, y: 0.95, width: 0.1, height: 0.1 },
      EVIDENCE_CONTEXT_PADDING
    );
    expect(padded.x).toBe(0);
    expect(padded.y + padded.height).toBeLessThanOrEqual(1);
    expect(padded.width).toBeGreaterThan(0.1);
  });

  it("padding presets are ordered template < candidate < evidence", () => {
    expect(TEMPLATE_PADDING).toBeLessThan(CANDIDATE_PREVIEW_PADDING);
    expect(CANDIDATE_PREVIEW_PADDING).toBeLessThan(EVIDENCE_CONTEXT_PADDING);
  });
});

describe("normalizedRectToPixelCrop", () => {
  it("converts to integer crop box inside the page", () => {
    const [x1, y1, x2, y2] = normalizedRectToPixelCrop(
      { x: 0.1, y: 0.2, width: 0.3, height: 0.25 },
      1000,
      800
    );
    expect([x1, y1, x2, y2]).toEqual([100, 160, 400, 360]);
  });

  it("grows tiny crops to the minimum readable size", () => {
    const [x1, y1, x2, y2] = normalizedRectToPixelCrop(
      { x: 0.5, y: 0.5, width: 0.001, height: 0.001 },
      1000,
      800,
      24
    );
    expect(x2 - x1).toBeGreaterThanOrEqual(24);
    expect(y2 - y1).toBeGreaterThanOrEqual(24);
  });

  it("stays inside page bounds even at the edge", () => {
    const [x1, y1, x2, y2] = normalizedRectToPixelCrop(
      { x: 0.99, y: 0.99, width: 0.01, height: 0.01 },
      1000,
      800,
      48
    );
    expect(x1).toBeGreaterThanOrEqual(0);
    expect(y1).toBeGreaterThanOrEqual(0);
    expect(x2).toBeLessThanOrEqual(1000);
    expect(y2).toBeLessThanOrEqual(800);
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeGreaterThan(y1);
  });
});

function cand(id: string): AnalyzeRegionCandidateDto {
  return {
    id,
    page_number: 1,
    bbox_pdf: [0, 0, 10, 10],
    bbox_px: [0, 0, 10, 10],
    color_layer: "green",
    kind: "symbol_candidate",
    label_suggestions: [],
    nearby_text: null,
    confidence: 0.8,
    source: "opencv",
    status: "probable",
    preview_image_url: null,
    normalized_position: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
  };
}

describe("attachCandidatePreviewUrls", () => {
  it("attaches URLs when generation succeeded and keeps null otherwise", () => {
    const result = attachCandidatePreviewUrls(
      [cand("a"), cand("b"), cand("c")],
      new Map([
        ["a", "https://storage/a.png"],
        ["b", null],
      ])
    );
    expect(result[0]!.preview_image_url).toBe("https://storage/a.png");
    expect(result[1]!.preview_image_url).toBeNull();
    expect(result[2]!.preview_image_url).toBeNull();
    // Other candidate data is untouched.
    expect(result[0]!.status).toBe("probable");
  });
});

describe("chooseEvidenceImageUrl", () => {
  it("prefers freshly generated crop, falls back to candidate preview, then null", () => {
    expect(chooseEvidenceImageUrl("gen.png", "prev.png")).toBe("gen.png");
    expect(chooseEvidenceImageUrl(null, "prev.png")).toBe("prev.png");
    expect(chooseEvidenceImageUrl(null, null)).toBeNull();
    expect(chooseEvidenceImageUrl(undefined, undefined)).toBeNull();
  });
});
