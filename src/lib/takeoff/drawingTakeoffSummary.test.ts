import { describe, expect, it } from "vitest";
import type { DrawingOccurrence } from "@/types/drawingTakeoff";
import {
  buildDrawingTakeoffSummary,
  isQuoteCreateSecondary,
  primaryCtaForTakeoff,
} from "./drawingTakeoffSummary";
import {
  buildEstimatorPdfMarkingHref,
  buildVisualTakeoffHref,
} from "@/services/takeoff/ensureDraftForVisualTakeoff";

function occ(overrides: Partial<DrawingOccurrence>): DrawingOccurrence {
  return {
    id: overrides.id ?? "a",
    projectId: "p1",
    drawingId: "d1",
    pageNumber: 1,
    type: "socket",
    trade: "electrical",
    label: "Zásuvka",
    source: "manual",
    status: "draft",
    normalizedPosition: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
    createdAt: "2026-07-14T10:00:00.000Z",
    updatedAt: "2026-07-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("drawingTakeoffSummary", () => {
  it("reports not_started when there are no occurrences", () => {
    const s = buildDrawingTakeoffSummary([]);
    expect(s.takeoffStatus).toBe("not_started");
    expect(s.hasVisualTakeoff).toBe(false);
    expect(s.countedOnDrawing).toBe(0);
    expect(primaryCtaForTakeoff(s)).toBe("start_visual");
    expect(isQuoteCreateSecondary(true, s)).toBe(true);
  });

  it("counts confirmed + used_in_quote as Spočítané vo výkrese", () => {
    const s = buildDrawingTakeoffSummary([
      occ({ id: "1", status: "confirmed" }),
      occ({ id: "2", status: "used_in_quote" }),
      occ({ id: "3", status: "needs_review", source: "similar_symbol_detected" }),
      occ({ id: "4", status: "rejected" }),
    ]);
    expect(s.countedOnDrawing).toBe(2);
    expect(s.needsReviewCount).toBe(1);
    expect(s.rejectedCount).toBe(1);
    expect(s.takeoffStatus).toBe("needs_review");
    expect(primaryCtaForTakeoff(s)).toBe("finish_review");
  });

  it("marks verified when all active marks are confirmed", () => {
    const s = buildDrawingTakeoffSummary([
      occ({ id: "1", status: "confirmed" }),
      occ({ id: "2", status: "used_in_quote" }),
      occ({ id: "3", status: "rejected" }),
    ]);
    expect(s.takeoffStatus).toBe("verified");
    expect(primaryCtaForTakeoff(s)).toBe("continue_quote");
    expect(isQuoteCreateSecondary(true, s)).toBe(false);
  });

  it("respects skipped_manual and keeps quote create available", () => {
    const s = buildDrawingTakeoffSummary([], { skippedManual: true });
    expect(s.takeoffStatus).toBe("skipped_manual");
    expect(primaryCtaForTakeoff(s)).toBe("manual_offer");
    expect(isQuoteCreateSecondary(true, s)).toBe(false);
  });

  it("does not block quote create when there is no PDF", () => {
    const s = buildDrawingTakeoffSummary([]);
    expect(isQuoteCreateSecondary(false, s)).toBe(false);
  });
});

describe("buildVisualTakeoffHref", () => {
  it("builds legacy takeoff URL (not main AI CTA)", () => {
    expect(
      buildVisualTakeoffHref({
        projectId: "abc",
        documentId: "doc1",
        returnTo: "new-project-proposal",
        mode: "quote-precheck",
      })
    ).toBe(
      "/app/projects/abc/takeoff?doc=doc1&returnTo=new-project-proposal&mode=quote-precheck"
    );
  });
});

describe("buildEstimatorPdfMarkingHref", () => {
  it("routes AI review visual CTA to setup=ai PDF marking, not /takeoff", () => {
    const href = buildEstimatorPdfMarkingHref({
      projectId: "abc",
      step: "material",
      tab: "pdf",
    });
    expect(href).toBe("/app/projects/abc?setup=ai&step=material&tab=pdf");
    expect(href).not.toContain("/takeoff");
  });
});
