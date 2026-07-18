import { describe, expect, it } from "vitest";
import {
  buildSimilarCandidates,
  type ExistingRect,
  type SimilarMatchInput,
} from "./findSimilarFromConfirmed";

const SOURCE = {
  id: "csym_src",
  symbolType: "socket",
  colorLayer: "green" as const,
  pageNumber: 1,
  normalizedPosition: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
};

function match(
  x: number,
  y: number,
  score = 0.9,
  pageNumber = 1
): SimilarMatchInput {
  return {
    pageNumber,
    matchScore: score,
    normalizedPosition: { x, y, width: 0.02, height: 0.02 },
  };
}

describe("buildSimilarCandidates", () => {
  it("returns probable template_match candidates with source symbol label", () => {
    const out = buildSimilarCandidates({
      matches: [match(0.3, 0.3), match(0.5, 0.5, 0.8)],
      sourceSymbol: SOURCE,
      confirmedSymbols: [],
      existingCandidates: [],
    });
    expect(out).toHaveLength(2);
    for (const c of out) {
      expect(c.source).toBe("template_match");
      expect(c.status).toBe("probable");
      expect(c.color_layer).toBe("green");
      expect(c.label_suggestions[0]!.label).toBe("zásuvka");
      expect(c.confidence).toBeGreaterThan(0);
    }
    // Sorted by score.
    expect(out[0]!.confidence).toBeGreaterThanOrEqual(out[1]!.confidence);
  });

  it("excludes matches overlapping existing confirmed symbols", () => {
    const confirmed: ExistingRect[] = [
      { pageNumber: 1, normalizedPosition: { x: 0.3, y: 0.3, width: 0.02, height: 0.02 } },
    ];
    const out = buildSimilarCandidates({
      matches: [match(0.3, 0.3), match(0.6, 0.6)],
      sourceSymbol: SOURCE,
      confirmedSymbols: confirmed,
      existingCandidates: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.normalized_position.x).toBeCloseTo(0.6);
  });

  it("excludes matches overlapping existing candidates (e.g. rejected)", () => {
    const rejected: ExistingRect[] = [
      {
        pageNumber: 1,
        normalizedPosition: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
        status: "rejected",
      },
    ];
    const out = buildSimilarCandidates({
      matches: [match(0.4, 0.4)],
      sourceSymbol: SOURCE,
      confirmedSymbols: [],
      existingCandidates: rejected,
    });
    expect(out).toHaveLength(0);
  });

  it("excludes the source symbol itself and dedupes overlapping matches", () => {
    const out = buildSimilarCandidates({
      matches: [
        match(0.1, 0.1, 0.99), // the reference itself
        match(0.3, 0.3, 0.9),
        match(0.301, 0.301, 0.85), // near-duplicate of previous — dropped
      ],
      sourceSymbol: SOURCE,
      confirmedSymbols: [],
      existingCandidates: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.confidence).toBeCloseTo(0.9);
  });

  it("drops below-threshold scores and long line-like boxes", () => {
    const line: SimilarMatchInput = {
      pageNumber: 1,
      matchScore: 0.95,
      normalizedPosition: { x: 0.2, y: 0.2, width: 0.3, height: 0.005 },
    };
    const out = buildSimilarCandidates({
      matches: [match(0.3, 0.3, 0.5), line],
      sourceSymbol: SOURCE,
      confirmedSymbols: [],
      existingCandidates: [],
      threshold: 0.75,
    });
    expect(out).toHaveLength(0);
  });

  it("caps results at maxResults", () => {
    const matches = Array.from({ length: 20 }, (_, i) => match(0.05 * i + 0.2, 0.8));
    const out = buildSimilarCandidates({
      matches,
      sourceSymbol: SOURCE,
      confirmedSymbols: [],
      existingCandidates: [],
      maxResults: 5,
    });
    expect(out).toHaveLength(5);
  });

  it("keeps matches on other pages when exclusions are page-scoped", () => {
    const confirmed: ExistingRect[] = [
      { pageNumber: 2, normalizedPosition: { x: 0.3, y: 0.3, width: 0.02, height: 0.02 } },
    ];
    const out = buildSimilarCandidates({
      matches: [match(0.3, 0.3, 0.9, 1)],
      sourceSymbol: SOURCE,
      confirmedSymbols: confirmed,
      existingCandidates: [],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.page_number).toBe(1);
  });

  it("emits bbox_pdf in PDF points when page size is known", () => {
    const out = buildSimilarCandidates({
      matches: [match(0.5, 0.5)],
      sourceSymbol: SOURCE,
      confirmedSymbols: [],
      existingCandidates: [],
      pageWidthPt: 841.89,
      pageHeightPt: 595.28,
    });
    expect(out[0]!.bbox_pdf[0]).toBeCloseTo(0.5 * 841.89);
    expect(out[0]!.bbox_pdf[1]).toBeCloseTo(0.5 * 595.28);
  });
});
