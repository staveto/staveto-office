import { describe, expect, it } from "vitest";
import {
  classifyStrictSimilarHit,
  bucketStrictSimilarHits,
  isLongLineBbox,
  isInLegendOrTitleArea,
  SIMILAR_ACCEPTED_MIN,
} from "./strictSimilarMatch";
import { filterSimilarCandidateMarks } from "./estimatorPositions";

const ref = { x: 0.4, y: 0.4, width: 0.02, height: 0.02 };

describe("strictSimilarMatch", () => {
  it("rejects loose color-only match (low NCC score)", () => {
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: { ...ref, x: 0.5 },
        matchScore: 0.45,
      })
    ).toBe("rejected");
  });

  it("rejects blue dimension / long thin line", () => {
    const line = { x: 0.2, y: 0.5, width: 0.18, height: 0.004 };
    expect(isLongLineBbox(line)).toBe(true);
    expect(
      classifyStrictSimilarHit(ref, { page: 1, bbox: line, matchScore: 0.9 })
    ).toBe("rejected");
  });

  it("rejects oversized black wall blob", () => {
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: { x: 0.1, y: 0.1, width: 0.12, height: 0.1 },
        matchScore: 0.9,
      })
    ).toBe("rejected");
  });

  it("rejects tiny text fragment", () => {
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: { x: 0.3, y: 0.3, width: 0.002, height: 0.002 },
        matchScore: 0.9,
      })
    ).toBe("rejected");
  });

  it("rejects legend/title area occurrence", () => {
    const legendHit = { x: 0.5, y: 0.01, width: 0.02, height: 0.02 };
    expect(isInLegendOrTitleArea(legendHit)).toBe(true);
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: legendHit,
        matchScore: 0.95,
      })
    ).toBe("rejected");
  });

  it("accepts strict template match", () => {
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: { x: 0.55, y: 0.42, width: 0.021, height: 0.019 },
        matchScore: 0.9,
      })
    ).toBe("accepted");
    expect(SIMILAR_ACCEPTED_MIN).toBe(0.85);
  });

  it("treats mid-band scores as uncertain (0.65–0.85)", () => {
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: { x: 0.55, y: 0.42, width: 0.021, height: 0.019 },
        matchScore: 0.82,
      })
    ).toBe("uncertain");
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: { x: 0.55, y: 0.42, width: 0.021, height: 0.019 },
        matchScore: 0.64,
      })
    ).toBe("rejected");
  });

  it("rejects wrong size/shape even with high score", () => {
    expect(
      classifyStrictSimilarHit(ref, {
        page: 1,
        bbox: { x: 0.5, y: 0.4, width: 0.08, height: 0.02 },
        matchScore: 0.95,
      })
    ).toBe("rejected");
  });

  it("keeps uncertain out of accepted bucket", () => {
    const buckets = bucketStrictSimilarHits(ref, [
      {
        page: 1,
        bbox: { x: 0.55, y: 0.42, width: 0.021, height: 0.019 },
        matchScore: 0.9,
      },
      {
        page: 1,
        bbox: { x: 0.6, y: 0.42, width: 0.022, height: 0.02 },
        matchScore: 0.7,
      },
      {
        page: 1,
        bbox: { x: 0.65, y: 0.42, width: 0.02, height: 0.02 },
        matchScore: 0.4,
      },
    ]);
    expect(buckets.accepted).toHaveLength(1);
    expect(buckets.uncertain).toHaveLength(1);
    expect(buckets.rejected).toHaveLength(1);
  });

  it("filterSimilarCandidateMarks with referenceBbox hides uncertain from accepted", () => {
    const filtered = filterSimilarCandidateMarks(
      [
        {
          page: 1,
          bbox: { x: 0.55, y: 0.42, width: 0.021, height: 0.019 },
          matchScore: 0.9,
        },
        {
          page: 1,
          bbox: { x: 0.6, y: 0.42, width: 0.022, height: 0.02 },
          matchScore: 0.7,
        },
      ],
      { referenceBbox: ref }
    );
    expect(filtered.accepted).toHaveLength(1);
    expect(filtered.uncertain).toHaveLength(1);
  });

  it("uncertain similar hits do not enter accepted takeoff marks", () => {
    const filtered = filterSimilarCandidateMarks(
      [
        {
          page: 1,
          bbox: { x: 0.55, y: 0.42, width: 0.021, height: 0.019 },
          matchScore: 0.78,
        },
      ],
      { referenceBbox: ref }
    );
    expect(filtered.accepted).toHaveLength(0);
    expect(filtered.uncertain).toHaveLength(1);
  });
});
