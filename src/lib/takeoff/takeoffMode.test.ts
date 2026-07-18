/**
 * Shared takeoff contract — mode permissions, central route and deep links.
 *
 * One tool, four contexts: quote / project / document / readonly must all
 * resolve to safe permission sets, and every entry point builds the same
 * canonical /app/projects/{id}/takeoff URL.
 */

import { describe, expect, it } from "vitest";
import {
  decodeBboxParam,
  encodeBboxParam,
  parseTakeoffMode,
  resolveTakeoffPermissions,
  takeoffRoute,
} from "./takeoffMode";

describe("resolveTakeoffPermissions", () => {
  it("quote mode allows editing, analysis, confirming and quote items", () => {
    const p = resolveTakeoffPermissions({ mode: "quote" });
    expect(p.allowEdit).toBe(true);
    expect(p.allowAnalyze).toBe(true);
    expect(p.allowConfirm).toBe(true);
    expect(p.allowCreateQuoteItems).toBe(true);
  });

  it("project mode edits takeoff but does not create quote items", () => {
    const p = resolveTakeoffPermissions({ mode: "project" });
    expect(p.allowEdit).toBe(true);
    expect(p.allowConfirm).toBe(true);
    expect(p.allowCreateQuoteItems).toBe(false);
  });

  it("document and readonly modes are always view-only", () => {
    for (const mode of ["document", "readonly"] as const) {
      const p = resolveTakeoffPermissions({ mode });
      expect(p.allowEdit).toBe(false);
      expect(p.allowAnalyze).toBe(false);
      expect(p.allowConfirm).toBe(false);
      expect(p.allowCreateQuoteItems).toBe(false);
    }
  });

  it("readonly cannot gain edit rights via overrides (hard gate)", () => {
    const p = resolveTakeoffPermissions({
      mode: "readonly",
      overrides: { allowEdit: true, allowConfirm: true },
    });
    expect(p.allowEdit).toBe(false);
    expect(p.allowConfirm).toBe(false);
  });

  it("canEditProject=false forces view-only even in quote mode", () => {
    const p = resolveTakeoffPermissions({ mode: "quote", canEditProject: false });
    expect(p.allowEdit).toBe(false);
    expect(p.allowConfirm).toBe(false);
    expect(p.allowCreateQuoteItems).toBe(false);
  });

  it("explicit overrides narrow editable modes", () => {
    const p = resolveTakeoffPermissions({
      mode: "quote",
      overrides: { allowCreateQuoteItems: false },
    });
    expect(p.allowEdit).toBe(true);
    expect(p.allowCreateQuoteItems).toBe(false);
  });
});

describe("takeoffRoute — central deep link", () => {
  it("builds the canonical route with drawing + mode", () => {
    expect(takeoffRoute({ projectId: "p1", drawingId: "d1", mode: "project" })).toBe(
      "/app/projects/p1/takeoff?doc=d1&mode=project"
    );
  });

  it("includes quoteId, page and bbox for evidence deep links", () => {
    const url = takeoffRoute({
      projectId: "p1",
      drawingId: "d1",
      quoteId: "q9",
      mode: "quote",
      page: 3,
      bbox: { x: 0.25, y: 0.5, width: 0.02, height: 0.03 },
    });
    expect(url).toContain("/app/projects/p1/takeoff?");
    expect(url).toContain("doc=d1");
    expect(url).toContain("quoteId=q9");
    expect(url).toContain("mode=quote");
    expect(url).toContain("page=3");
    expect(url).toContain("bbox=0.25%2C0.5%2C0.02%2C0.03");
  });

  it("omits page=1 and empty params", () => {
    const url = takeoffRoute({ projectId: "p1", drawingId: "d1", page: 1 });
    expect(url).toBe("/app/projects/p1/takeoff?doc=d1");
  });
});

describe("bbox param round trip", () => {
  it("encode → decode preserves the rect", () => {
    const rect = { x: 0.12345, y: 0.5, width: 0.02, height: 0.031 };
    const decoded = decodeBboxParam(encodeBboxParam(rect));
    expect(decoded).not.toBeNull();
    expect(decoded!.x).toBeCloseTo(rect.x, 4);
    expect(decoded!.y).toBeCloseTo(rect.y, 4);
    expect(decoded!.width).toBeCloseTo(rect.width, 4);
    expect(decoded!.height).toBeCloseTo(rect.height, 4);
  });

  it("rejects malformed values", () => {
    expect(decodeBboxParam(null)).toBeNull();
    expect(decodeBboxParam("")).toBeNull();
    expect(decodeBboxParam("1,2,3")).toBeNull();
    expect(decodeBboxParam("a,b,c,d")).toBeNull();
    expect(decodeBboxParam("0.1,0.1,-0.5,0.2")).toBeNull();
  });
});

describe("parseTakeoffMode", () => {
  it("accepts the four shared modes and rejects anything else", () => {
    expect(parseTakeoffMode("quote")).toBe("quote");
    expect(parseTakeoffMode("project")).toBe("project");
    expect(parseTakeoffMode("document")).toBe("document");
    expect(parseTakeoffMode("readonly")).toBe("readonly");
    expect(parseTakeoffMode("quote-precheck")).toBeNull();
    expect(parseTakeoffMode("admin")).toBeNull();
    expect(parseTakeoffMode(null)).toBeNull();
  });
});
