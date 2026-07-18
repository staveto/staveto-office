import { describe, expect, it } from "vitest";
import type { DrawingOccurrence } from "@/types/drawingTakeoff";
import {
  normalizedToScreenRect,
  screenToNormalizedRect,
  pointToNormalizedRect,
  normalizeDragRect,
  computeEvidenceFocusTarget,
  fitPageZoom,
  fitWidthZoom,
  nextRotation,
  occurrenceColor,
  occurrenceMarkerStyle,
  occurrenceLayer,
  filterOccurrences,
  aggregateByType,
  countByStatus,
  groupByTrade,
  rotateNormalizedRect,
  typesForTrade,
  defaultUnitFor,
  unrotateNormalizedRect,
  type ViewRotation,
} from "./drawingTakeoff";
import {
  buildQuoteLinesFromOccurrences,
  confirmedOccurrences,
  newLinesAgainstExisting,
} from "./quoteGeneration";
import { assemblyRuleFor } from "./assemblyRules";

function occ(overrides: Partial<DrawingOccurrence>): DrawingOccurrence {
  return {
    id: overrides.id ?? `occ_${Math.random().toString(36).slice(2, 8)}`,
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

describe("coordinate conversion", () => {
  const canvas = { width: 800, height: 600 };

  it("converts normalized rect to screen pixels and back", () => {
    const normalized = { x: 0.25, y: 0.5, width: 0.1, height: 0.05 };
    const screen = normalizedToScreenRect(normalized, canvas);
    expect(screen).toEqual({ x: 200, y: 300, width: 80, height: 30 });
    const roundTrip = screenToNormalizedRect(screen, canvas);
    expect(roundTrip.x).toBeCloseTo(normalized.x, 6);
    expect(roundTrip.y).toBeCloseTo(normalized.y, 6);
    expect(roundTrip.width).toBeCloseTo(normalized.width, 6);
    expect(roundTrip.height).toBeCloseTo(normalized.height, 6);
  });

  it("stays aligned across zoom — same normalized rect maps proportionally", () => {
    const normalized = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
    const zoomedCanvas = { width: 1600, height: 1200 }; // 2x zoom
    const base = normalizedToScreenRect(normalized, canvas);
    const zoomed = normalizedToScreenRect(normalized, zoomedCanvas);
    expect(zoomed.x).toBe(base.x * 2);
    expect(zoomed.width).toBe(base.width * 2);
  });

  it("clamps out-of-bounds screen rects to the page", () => {
    const clamped = screenToNormalizedRect(
      { x: -50, y: 550, width: 100, height: 200 },
      canvas
    );
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBeCloseTo(550 / 600, 6);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1);
  });

  it("returns zero rect for a degenerate canvas", () => {
    expect(screenToNormalizedRect({ x: 10, y: 10, width: 5, height: 5 }, { width: 0, height: 0 }))
      .toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("creates a small centered marker box from a point click", () => {
    const rect = pointToNormalizedRect({ x: 400, y: 300 }, canvas, 20);
    expect(rect.x).toBeCloseTo((400 - 10) / 800, 6);
    expect(rect.y).toBeCloseTo((300 - 10) / 600, 6);
    expect(rect.width).toBeCloseTo(20 / 800, 6);
  });

  it("normalizes drag rectangles regardless of corner order", () => {
    expect(normalizeDragRect({ x: 100, y: 100 }, { x: 40, y: 60 })).toEqual({
      x: 40,
      y: 60,
      width: 60,
      height: 40,
    });
  });
});

describe("evidence click → viewer zoom/scroll target", () => {
  const canvas = { width: 1000, height: 800 };
  const viewport = { width: 400, height: 300 };

  it("centers the evidence bbox in the viewport", () => {
    // Rendered bbox: x=500, y=400, 100x80 → center (550, 440).
    const target = computeEvidenceFocusTarget(
      { x: 0.5, y: 0.5, width: 0.1, height: 0.1 },
      canvas,
      viewport
    );
    expect(target.scrollLeft).toBeCloseTo(550 - 200);
    expect(target.scrollTop).toBeCloseTo(440 - 150);
    expect(target.zoomBump).toBe(false);
  });

  it("clamps scroll to non-negative for evidence near the page origin", () => {
    const target = computeEvidenceFocusTarget(
      { x: 0.01, y: 0.01, width: 0.05, height: 0.05 },
      canvas,
      viewport
    );
    expect(target.scrollLeft).toBe(0);
    expect(target.scrollTop).toBe(0);
  });

  it("requests a zoom bump for tiny evidence marks", () => {
    const target = computeEvidenceFocusTarget(
      { x: 0.4, y: 0.4, width: 0.01, height: 0.01 }, // 10x8 px — unreadable
      canvas,
      viewport
    );
    expect(target.zoomBump).toBe(true);
  });

  it("scroll target scales with zoom (larger canvas)", () => {
    const normalized = { x: 0.5, y: 0.5, width: 0.1, height: 0.1 };
    const base = computeEvidenceFocusTarget(normalized, canvas, viewport);
    const zoomed = computeEvidenceFocusTarget(
      normalized,
      { width: 2000, height: 1600 },
      viewport
    );
    expect(zoomed.scrollLeft).toBeCloseTo(base.scrollLeft * 2 + viewport.width / 2);
  });
});

describe("marker colors and layers", () => {
  it("uses source colors for pending items and status colors once resolved", () => {
    expect(occurrenceColor(occ({ source: "manual", status: "draft" }))).toBe("#2563EB");
    expect(occurrenceColor(occ({ source: "ai_detected", status: "needs_review" }))).toBe("#7C3AED");
    expect(
      occurrenceColor(occ({ source: "similar_symbol_detected", status: "needs_review" }))
    ).toBe("#EA580C");
    expect(occurrenceColor(occ({ source: "manual", status: "confirmed" }))).toBe("#16A34A");
    expect(occurrenceColor(occ({ source: "manual", status: "used_in_quote" }))).toBe("#14532D");
  });

  it("renders rejected markers with low opacity and candidates dashed", () => {
    expect(occurrenceMarkerStyle(occ({ status: "rejected" })).opacity).toBeLessThan(1);
    expect(occurrenceMarkerStyle(occ({ status: "needs_review" })).dashed).toBe(true);
    expect(occurrenceMarkerStyle(occ({ status: "confirmed" })).dashed).toBe(false);
  });

  it("maps occurrences to viewer layers", () => {
    expect(occurrenceLayer(occ({ source: "manual", status: "draft" }))).toBe("manual");
    expect(occurrenceLayer(occ({ source: "ai_detected", status: "needs_review" }))).toBe("ai");
    expect(
      occurrenceLayer(occ({ source: "similar_symbol_detected", status: "needs_review" }))
    ).toBe("candidates");
    expect(occurrenceLayer(occ({ status: "confirmed" }))).toBe("confirmed");
    expect(occurrenceLayer(occ({ status: "used_in_quote" }))).toBe("used_in_quote");
    expect(occurrenceLayer(occ({ status: "rejected" }))).toBe("rejected");
  });
});

describe("aggregation", () => {
  const sample = [
    occ({ id: "a", type: "socket", label: "Zásuvka", status: "confirmed" }),
    occ({ id: "b", type: "socket", label: "Zásuvka", status: "needs_review" }),
    occ({ id: "c", type: "switch", label: "Vypínač", status: "confirmed" }),
    occ({ id: "d", type: "socket", label: "Zásuvka", status: "rejected" }),
    occ({ id: "e", trade: "heating", type: "radiator", label: "Radiátor", status: "draft" }),
  ];

  it("aggregates counts by trade+type excluding rejected", () => {
    const rows = aggregateByType(sample);
    const socket = rows.find((r) => r.type === "socket");
    expect(socket?.total).toBe(2); // rejected excluded
    expect(socket?.confirmed).toBe(1);
    expect(socket?.needsReview).toBe(1);
    const radiator = rows.find((r) => r.type === "radiator");
    expect(radiator?.trade).toBe("heating");
    expect(radiator?.needsReview).toBe(1);
  });

  it("counts by status including total", () => {
    const counts = countByStatus(sample);
    expect(counts.total).toBe(5);
    expect(counts.confirmed).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.needs_review).toBe(1);
    expect(counts.draft).toBe(1);
  });

  it("groups by trade", () => {
    const groups = groupByTrade(sample);
    expect(groups.map((g) => g.trade)).toContain("electrical");
    expect(groups.map((g) => g.trade)).toContain("heating");
    expect(groups.find((g) => g.trade === "electrical")?.occurrences).toHaveLength(4);
  });

  it("filters by status, trade and search", () => {
    expect(filterOccurrences(sample, { status: "confirmed" })).toHaveLength(2);
    expect(filterOccurrences(sample, { trade: "heating" })).toHaveLength(1);
    expect(filterOccurrences(sample, { search: "vypínač" })).toHaveLength(1);
    expect(filterOccurrences(sample, { status: "all", trade: "all" })).toHaveLength(5);
  });
});

describe("type catalog", () => {
  it("offers types per trade — not electrical only", () => {
    expect(typesForTrade("electrical").length).toBeGreaterThan(0);
    expect(typesForTrade("plumbing").length).toBeGreaterThan(0);
    expect(typesForTrade("heating").length).toBeGreaterThan(0);
    expect(typesForTrade("hvac").length).toBeGreaterThan(0);
  });

  it("resolves default units with fallback", () => {
    expect(defaultUnitFor("electrical", "led_strip")).toBe("m");
    expect(defaultUnitFor("electrical", "nonexistent")).toBe("ks");
  });
});

describe("quote generation from confirmed occurrences", () => {
  const sample = [
    occ({ id: "a", type: "socket", label: "Zásuvka", status: "confirmed" }),
    occ({ id: "b", type: "socket", label: "Zásuvka", status: "confirmed" }),
    occ({ id: "c", type: "socket", label: "Zásuvka", status: "needs_review" }),
    occ({ id: "d", type: "switch", label: "Vypínač", status: "used_in_quote" }),
    occ({ id: "e", type: "socket", label: "Zásuvka", status: "rejected" }),
  ];

  it("only confirmed/used occurrences are eligible", () => {
    expect(confirmedOccurrences(sample).map((o) => o.id)).toEqual(["a", "b", "d"]);
  });

  it("groups same trade+type+label into one line with quantity = count", () => {
    const lines = buildQuoteLinesFromOccurrences(sample);
    const socketLine = lines.find((l) => l.name === "Zásuvka");
    expect(socketLine?.quantity).toBe(2);
    expect(socketLine?.unit).toBe("ks");
    expect(socketLine?.source).toBe("drawing_detection");
    expect(socketLine?.sourceOccurrenceIds).toEqual(["a", "b"]);
    // no invented prices
    expect(socketLine?.materialUnitPrice).toBeUndefined();
  });

  it("expands assembly rules into rule_derived needs_review lines", () => {
    const lines = buildQuoteLinesFromOccurrences(sample, {
      expandAssemblies: true,
      translate: (k) => k,
    });
    const derived = lines.filter((l) => l.source === "rule_derived");
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.every((l) => l.status === "needs_review")).toBe(true);
    // socket assembly scales by group quantity (2 sockets → 2 flush boxes)
    const flushBox = derived.find((l) => l.name === "takeoff.assembly.common.flushBox");
    expect(flushBox?.quantity).toBe(2);
    // work components carry the work category
    const install = derived.find((l) => l.name === "takeoff.assembly.socket.install");
    expect(install?.category).toBe("work");
  });

  it("has assembly rules for switch, socket, radiator and sink", () => {
    expect(assemblyRuleFor("electrical", "switch")).toBeDefined();
    expect(assemblyRuleFor("electrical", "socket")).toBeDefined();
    expect(assemblyRuleFor("heating", "radiator")).toBeDefined();
    expect(assemblyRuleFor("plumbing", "sink")).toBeDefined();
    expect(assemblyRuleFor("general", "generic")).toBeUndefined();
  });

  it("preserves manually added quote items — only new lines are returned", () => {
    const generated = buildQuoteLinesFromOccurrences(sample);
    const manualExisting = [
      { name: "Zásuvka", unit: "ks" }, // manual line with same name/unit → skipped
      { name: "Moja ručná položka", unit: "m" },
    ];
    const fresh = newLinesAgainstExisting(generated, manualExisting);
    expect(fresh.find((l) => l.name === "Zásuvka")).toBeUndefined();
    expect(fresh.find((l) => l.name === "Vypínač")).toBeDefined();
    // manual entries are never returned/modified
    expect(fresh.find((l) => l.name === "Moja ručná položka")).toBeUndefined();
  });
});

describe("view rotation (coordinate conversion)", () => {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.1 };

  it("nextRotation cycles through 0/90/180/270 both directions", () => {
    expect(nextRotation(0, 90)).toBe(90);
    expect(nextRotation(270, 90)).toBe(0);
    expect(nextRotation(0, -90)).toBe(270);
    expect(nextRotation(90, -90)).toBe(0);
  });

  it("rotate 90° maps page rect to the expected view rect", () => {
    const v = rotateNormalizedRect(rect, 90);
    // clockwise: (x,y) → (1 - y - h, x), dimensions swap
    expect(v.x).toBeCloseTo(1 - rect.y - rect.height);
    expect(v.y).toBeCloseTo(rect.x);
    expect(v.width).toBeCloseTo(rect.height);
    expect(v.height).toBeCloseTo(rect.width);
  });

  it("rotate 180° mirrors both axes and keeps dimensions", () => {
    const v = rotateNormalizedRect(rect, 180);
    expect(v.x).toBeCloseTo(1 - rect.x - rect.width);
    expect(v.y).toBeCloseTo(1 - rect.y - rect.height);
    expect(v.width).toBeCloseTo(rect.width);
    expect(v.height).toBeCloseTo(rect.height);
  });

  it("unrotate is the exact inverse for every rotation", () => {
    for (const rotation of [0, 90, 180, 270] as ViewRotation[]) {
      const roundTrip = unrotateNormalizedRect(
        rotateNormalizedRect(rect, rotation),
        rotation
      );
      expect(roundTrip.x).toBeCloseTo(rect.x);
      expect(roundTrip.y).toBeCloseTo(rect.y);
      expect(roundTrip.width).toBeCloseTo(rect.width);
      expect(roundTrip.height).toBeCloseTo(rect.height);
    }
  });

  it("marker drawn in a rotated view lands on the correct page position", () => {
    // Simulates the viewer: user draws in view space at 90°, we store page space.
    const drawnInView = rotateNormalizedRect(rect, 90);
    const stored = unrotateNormalizedRect(drawnInView, 90);
    expect(stored.x).toBeCloseTo(rect.x);
    expect(stored.y).toBeCloseTo(rect.y);
  });

  it("analyze-region bbox drawn at 0/90/180/270 maps to the same unrotated page rect", () => {
    // Regression: the viewer converts every drawn analyze rect from view space
    // to page space via unrotateNormalizedRect before analysis runs.
    const pageRect = { x: 0.37, y: 0.12, width: 0.08, height: 0.05 };
    for (const rotation of [0, 90, 180, 270] as ViewRotation[]) {
      const drawnInView = rotateNormalizedRect(pageRect, rotation);
      const analyzed = unrotateNormalizedRect(drawnInView, rotation);
      expect(analyzed.x).toBeCloseTo(pageRect.x);
      expect(analyzed.y).toBeCloseTo(pageRect.y);
      expect(analyzed.width).toBeCloseTo(pageRect.width);
      expect(analyzed.height).toBeCloseTo(pageRect.height);
    }
  });

  it("rotation 270: drawn view rect maps to the expected page coordinates", () => {
    // At 270° view rotation the inverse mapping is (x,y,w,h) → (1-y-h, x, h, w).
    const drawn = { x: 0.2, y: 0.6, width: 0.1, height: 0.3 };
    const page = unrotateNormalizedRect(drawn, 270);
    expect(page.x).toBeCloseTo(1 - drawn.y - drawn.height); // 0.1
    expect(page.y).toBeCloseTo(drawn.x); // 0.2
    expect(page.width).toBeCloseTo(drawn.height); // 0.3
    expect(page.height).toBeCloseTo(drawn.width); // 0.1
  });
});

describe("fit calculations (left edge stays reachable)", () => {
  const baseCss = { width: 1000, height: 700 }; // page CSS size at zoom = 1

  it("fitWidthZoom fills the viewport width minus padding", () => {
    expect(fitWidthZoom(baseCss, { width: 1016 })).toBeCloseTo(1);
    expect(fitWidthZoom(baseCss, { width: 516 })).toBeCloseTo(0.5);
  });

  it("fitPageZoom picks the smaller of width/height fit", () => {
    // Height is the constraint: (366-16)/700 = 0.5 < (1016-16)/1000 = 1
    expect(fitPageZoom(baseCss, { width: 1016, height: 366 })).toBeCloseTo(0.5);
    // Width is the constraint
    expect(fitPageZoom(baseCss, { width: 516, height: 2000 })).toBeCloseTo(0.5);
  });

  it("fit zoom is always positive even for degenerate inputs", () => {
    expect(fitPageZoom({ width: 0, height: 0 }, { width: 800, height: 600 })).toBe(1);
    expect(fitWidthZoom(baseCss, { width: 0 })).toBeGreaterThan(0);
  });
});
