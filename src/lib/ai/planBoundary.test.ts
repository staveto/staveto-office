import { describe, expect, it } from "vitest";
import { classifyPlanClick } from "./planBoundary";

describe("planBoundary", () => {
  it("treats click inside page as inside_plan", () => {
    const r = classifyPlanClick({ x: 0.45, y: 0.55 });
    expect(r.status).toBe("inside_plan");
    expect(r.excludeFromTakeoff).toBe(false);
  });

  it("treats click clearly outside page as outside_plan", () => {
    const r = classifyPlanClick({ x: 1.08, y: 0.5 });
    expect(r.status).toBe("outside_plan");
    expect(r.excludeFromTakeoff).toBe(true);
  });

  it("uses boundary_uncertain near edges instead of outside_plan", () => {
    const r = classifyPlanClick({ x: 0.01, y: 0.5 });
    expect(r.status).toBe("boundary_uncertain");
    expect(r.excludeFromTakeoff).toBe(false);
    expect(r.needsReview).toBe(true);
  });

  it("flags legend region without excluding from takeoff", () => {
    const r = classifyPlanClick(
      { x: 0.85, y: 0.1 },
      { legendRegions: [{ x: 0.8, y: 0.05, width: 0.15, height: 0.2 }] }
    );
    expect(r.status).toBe("in_legend_or_table");
    expect(r.excludeFromTakeoff).toBe(false);
  });
});
