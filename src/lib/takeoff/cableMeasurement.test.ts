import { describe, expect, it } from "vitest";
import type { CableRun, DrawingScaleCalibration } from "@/types/pdfTakeoff";
import {
  computeCableRunTotals,
  computeScaleCalibration,
  convertCableRunsToTakeoffItems,
  distanceBetweenNormalizedPointsPt,
  groupCableRunsByType,
  insertCableRunPoint,
  parseRealLengthToMeters,
  polylineLengthMeters,
  removeCableRunPoint,
} from "./cableMeasurement";

const PAGE_W = 842; // A3 landscape in PDF points
const PAGE_H = 595;

function makeCalibration(
  overrides: Partial<DrawingScaleCalibration> = {}
): DrawingScaleCalibration {
  // 0.5 page width = 421 pt ≙ 4.21 m → 0.01 m per pt
  return {
    id: "cal_1",
    projectId: "p1",
    drawingId: "d1",
    pageNumber: 1,
    pointA: { x: 0.25, y: 0.5 },
    pointB: { x: 0.75, y: 0.5 },
    pageWidthPt: PAGE_W,
    pageHeightPt: PAGE_H,
    realLengthM: 4.21,
    pdfDistancePt: 421,
    metersPerPdfPoint: 0.01,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRun(overrides: Partial<CableRun> = {}): CableRun {
  return {
    id: "run_1",
    projectId: "p1",
    drawingId: "d1",
    pageNumber: 1,
    name: "K1",
    cableTypeName: "CYKY-J 3x2,5",
    installationType: "groove",
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.1 },
    ],
    measured2dLengthM: 0,
    verticalLengthM: 0,
    fixedReserveM: 0,
    reservePercent: 10,
    roundingStepM: 1,
    finalLengthM: 0,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("distanceBetweenNormalizedPointsPt", () => {
  it("scales dx/dy by the respective page dimension", () => {
    // Horizontal: 0.5 of width = 421 pt
    expect(
      distanceBetweenNormalizedPointsPt({ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, PAGE_W, PAGE_H)
    ).toBeCloseTo(421, 6);
    // Vertical: 0.5 of height = 297.5 pt
    expect(
      distanceBetweenNormalizedPointsPt({ x: 0.5, y: 0.25 }, { x: 0.5, y: 0.75 }, PAGE_W, PAGE_H)
    ).toBeCloseTo(297.5, 6);
    // Diagonal 3-4-5 triangle in points
    expect(
      distanceBetweenNormalizedPointsPt(
        { x: 0, y: 0 },
        { x: 300 / PAGE_W, y: 400 / PAGE_H },
        PAGE_W,
        PAGE_H
      )
    ).toBeCloseTo(500, 6);
  });
});

describe("computeScaleCalibration", () => {
  it("derives metersPerPdfPoint = realLengthM / pdfDistancePt", () => {
    const result = computeScaleCalibration({
      pointA: { x: 0.25, y: 0.5 },
      pointB: { x: 0.75, y: 0.5 },
      pageWidthPt: PAGE_W,
      pageHeightPt: PAGE_H,
      realLengthM: 4.21,
    });
    expect(result).not.toBeNull();
    expect(result!.pdfDistancePt).toBeCloseTo(421, 6);
    expect(result!.metersPerPdfPoint).toBeCloseTo(0.01, 9);
  });

  it("rejects identical points and non-positive lengths", () => {
    expect(
      computeScaleCalibration({
        pointA: { x: 0.5, y: 0.5 },
        pointB: { x: 0.5, y: 0.5 },
        pageWidthPt: PAGE_W,
        pageHeightPt: PAGE_H,
        realLengthM: 2,
      })
    ).toBeNull();
    expect(
      computeScaleCalibration({
        pointA: { x: 0.1, y: 0.5 },
        pointB: { x: 0.9, y: 0.5 },
        pageWidthPt: PAGE_W,
        pageHeightPt: PAGE_H,
        realLengthM: 0,
      })
    ).toBeNull();
  });
});

describe("parseRealLengthToMeters", () => {
  it("accepts meters, millimeters and comma decimals", () => {
    expect(parseRealLengthToMeters("1.77")).toBeCloseTo(1.77);
    expect(parseRealLengthToMeters("1,77 m")).toBeCloseTo(1.77);
    expect(parseRealLengthToMeters("1770 mm")).toBeCloseTo(1.77);
    expect(parseRealLengthToMeters("250 cm")).toBeCloseTo(2.5);
  });

  it("rejects garbage and non-positive values", () => {
    expect(parseRealLengthToMeters("")).toBeNull();
    expect(parseRealLengthToMeters("abc")).toBeNull();
    expect(parseRealLengthToMeters("0")).toBeNull();
    expect(parseRealLengthToMeters("-2 m")).toBeNull();
  });
});

describe("polylineLengthMeters", () => {
  it("sums all segments of a multi-point route", () => {
    const calibration = makeCalibration();
    // L-shape: 210.5 pt right + 148.75 pt down = 359.25 pt → 3.5925 m
    const points = [
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.25 },
      { x: 0.5, y: 0.5 },
    ];
    expect(polylineLengthMeters(points, calibration)).toBeCloseTo(
      (0.25 * PAGE_W + 0.25 * PAGE_H) * 0.01,
      6
    );
  });

  it("returns null without a calibration — never a fake length", () => {
    expect(
      polylineLengthMeters(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        null
      )
    ).toBeNull();
  });

  it("excludes 'pen-up' gap segments from the length", () => {
    const calibration = makeCalibration();
    // Two horizontal sections of 0.25 width each, connected by a diagonal
    // jump that must NOT count: gapIndexes = [2] skips points[1]→points[2].
    const points = [
      { x: 0.1, y: 0.2 },
      { x: 0.35, y: 0.2 },
      { x: 0.1, y: 0.6 },
      { x: 0.35, y: 0.6 },
    ];
    expect(polylineLengthMeters(points, calibration, [2])).toBeCloseTo(
      2 * (0.25 * PAGE_W) * 0.01,
      6
    );
    // Without gaps the jump counts too — sanity check the difference.
    expect(polylineLengthMeters(points, calibration)!).toBeGreaterThan(
      polylineLengthMeters(points, calibration, [2])!
    );
  });
});

describe("insertCableRunPoint / removeCableRunPoint", () => {
  const points = [
    { x: 0.1, y: 0.1 },
    { x: 0.3, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.7, y: 0.1 },
  ];

  it("insert shifts later gap indexes and keeps both halves of a split gap", () => {
    // Gap on segment 1→2; insert into segment 0→1 shifts it to 2→3.
    const shifted = insertCableRunPoint(points, [2], 0, { x: 0.2, y: 0.1 });
    expect(shifted.points).toHaveLength(5);
    expect(shifted.gapIndexes).toEqual([3]);
    // Splitting the gap segment itself keeps BOTH halves unmeasured.
    const split = insertCableRunPoint(points, [2], 1, { x: 0.4, y: 0.1 });
    expect(split.points).toHaveLength(5);
    expect(split.gapIndexes).toEqual([2, 3]);
  });

  it("remove merges adjacent segments and keeps the gap when either side was one", () => {
    // Removing point 2 merges segments 1→2 (gap) and 2→3 → merged stays gap.
    const merged = removeCableRunPoint(points, [2], 2);
    expect(merged).not.toBeNull();
    expect(merged!.points).toHaveLength(3);
    expect(merged!.gapIndexes).toEqual([2]);
    // Removing an endpoint just drops its segment (and its gap flag).
    const tail = removeCableRunPoint(points, [3], 3);
    expect(tail!.points).toHaveLength(3);
    expect(tail!.gapIndexes).toEqual([]);
    // A route never shrinks below 2 points.
    expect(removeCableRunPoint(points.slice(0, 2), [], 0)).toBeNull();
  });
});

describe("computeCableRunTotals", () => {
  it("respects gapIndexes when measuring the route", () => {
    const calibration = makeCalibration();
    const run = makeRun({
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.35, y: 0.2 },
        { x: 0.1, y: 0.6 },
        { x: 0.35, y: 0.6 },
      ],
      gapIndexes: [2],
      reservePercent: 0,
      roundingStepM: 0.01,
    });
    const totals = computeCableRunTotals(run, calibration);
    expect(totals).not.toBeNull();
    expect(totals!.measured2dLengthM).toBeCloseTo(2 * (0.25 * PAGE_W) * 0.01, 2);
  });

  it("applies vertical drops, fixed reserve, 10 % reserve and 1 m rounding", () => {
    const calibration = makeCalibration();
    // Route: 0.25 width = 210.5 pt → 2.105 m; + vertical 4.2 + fixed 0.5
    const run = makeRun({
      points: [
        { x: 0.25, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ],
      verticalLengthM: 4.2,
      fixedReserveM: 0.5,
      reservePercent: 10,
      roundingStepM: 1,
    });
    const totals = computeCableRunTotals(run, calibration);
    expect(totals).not.toBeNull();
    expect(totals!.measured2dLengthM).toBeCloseTo(2.11, 2);
    expect(totals!.rawLengthM).toBeCloseTo(6.81, 2);
    // 6.805 * 1.1 = 7.4855 → ceil to 8 m
    expect(totals!.finalLengthM).toBe(8);
  });

  it("rounds up to the configured step", () => {
    const calibration = makeCalibration();
    const run = makeRun({
      points: [
        { x: 0, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ], // 421 pt → 4.21 m
      reservePercent: 0,
      roundingStepM: 5,
    });
    expect(computeCableRunTotals(run, calibration)!.finalLengthM).toBe(5);
  });

  it("guards against roundingStepM = 0", () => {
    const calibration = makeCalibration();
    const run = makeRun({ roundingStepM: 0, reservePercent: 0 });
    const totals = computeCableRunTotals(run, calibration);
    expect(totals).not.toBeNull();
    expect(Number.isFinite(totals!.finalLengthM)).toBe(true);
    expect(totals!.finalLengthM).toBeGreaterThan(0);
  });

  it("returns null without a calibration", () => {
    expect(computeCableRunTotals(makeRun(), null)).toBeNull();
  });
});

describe("groupCableRunsByType", () => {
  it("groups by cable type + installation type and sums final lengths", () => {
    const runs = [
      makeRun({ id: "a", cableTypeName: "CYKY-J 3x2,5", installationType: "groove", finalLengthM: 18 }),
      makeRun({ id: "b", cableTypeName: "CYKY-J 3x2,5", installationType: "groove", finalLengthM: 9 }),
      makeRun({ id: "c", cableTypeName: "CYKY-J 3x2,5", installationType: "ceiling", finalLengthM: 7 }),
      makeRun({ id: "d", cableTypeName: "UTP CAT6", installationType: "conduit", finalLengthM: 22 }),
    ];
    const groups = groupCableRunsByType(runs);
    expect(groups).toHaveLength(3);
    const grooveGroup = groups.find(
      (g) => g.cableTypeName === "CYKY-J 3x2,5" && g.installationType === "groove"
    );
    expect(grooveGroup!.totalFinalLengthM).toBe(27);
    expect(grooveGroup!.runs.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("convertCableRunsToTakeoffItems", () => {
  const options = { projectId: "p1", drawingId: "d1", pageNumber: 1 };

  it("exports only approved runs, aggregated per group, unit m", () => {
    const runs = [
      makeRun({ id: "a", status: "approved", finalLengthM: 18 }),
      makeRun({ id: "b", status: "approved", finalLengthM: 9 }),
      makeRun({ id: "c", status: "draft", finalLengthM: 100 }),
      makeRun({ id: "d", status: "approved", cableTypeName: "UTP CAT6", finalLengthM: 22 }),
    ];
    const items = convertCableRunsToTakeoffItems(runs, options);
    expect(items).toHaveLength(2);
    const cyky = items.find((i) => i.name === "CYKY-J 3x2,5")!;
    expect(cyky.quantity).toBe(27);
    expect(cyky.unit).toBe("m");
    expect(cyky.sourceOfQuantity).toBe("route_calculation");
    expect(cyky.metadata.sourceType).toBe("cable_run_group");
  });

  it("is idempotent — same groups always map to the same item ids", () => {
    const runs = [makeRun({ id: "a", status: "approved", finalLengthM: 18 })];
    const first = convertCableRunsToTakeoffItems(runs, options);
    const second = convertCableRunsToTakeoffItems(
      [makeRun({ id: "a", status: "approved", finalLengthM: 31 })],
      options
    );
    expect(first[0].id).toBe(second[0].id);
    expect(second[0].quantity).toBe(31);
  });

  it("uses the catalog item name when linked", () => {
    const runs = [
      makeRun({ id: "a", status: "approved", finalLengthM: 12, catalogItemId: "cat1" }),
    ];
    const items = convertCableRunsToTakeoffItems(runs, {
      ...options,
      catalogItems: [{ id: "cat1", name: "Kábel CYKY-J 3x2,5 (balenie 100 m)" }],
    });
    expect(items[0].name).toBe("Kábel CYKY-J 3x2,5 (balenie 100 m)");
    expect(items[0].metadata.catalogItemId).toBe("cat1");
  });
});
