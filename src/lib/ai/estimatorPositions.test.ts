import { describe, expect, it } from "vitest";
import {
  applyAnnotationSelection,
  applyCatalogPriceToPosition,
  applyManualPriceToPosition,
  applyPriceToSimilarPositions,
  buildEstimatorPositionsFromFacts,
  buildPdfOverlayAnnotations,
  confirmPosition,
  excludePositionFromQuote,
  filterEstimatorPositions,
  ignorePosition,
  isPositionFixedQuoteEligible,
  markPositionCustomerSupplied,
  positionIdForAnnotation,
  positionsBlockFixedQuote,
  sortEstimatorPositions,
  summarizeEstimatorPositions,
  type EstimatorPosition,
} from "./estimatorPositions";
import type { AiEstimatorFacts, AiExtractedItem } from "@/types/aiEstimator";
import type { VisualSymbolDetection } from "@/types/visualSymbols";

const FILE = "08_Znacenie_elektrika_2.pdf";

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

function item(
  partial: Partial<AiExtractedItem> &
    Pick<AiExtractedItem, "id" | "title" | "category">
): AiExtractedItem {
  return {
    origin: "from_document",
    evidence: [{ fileName: FILE, page: 1, inputType: "pdf" }],
    confidence: "medium",
    needsReview: false,
    quantity: 1,
    unit: "ks",
    ...partial,
  };
}

function visualDet(partial: Partial<VisualSymbolDetection>): VisualSymbolDetection {
  return {
    id: partial.id ?? `v_${Math.random().toString(36).slice(2, 8)}`,
    normalizedPoint: "switch_point",
    page: 1,
    bbox: { x: 100, y: 100, width: 20, height: 20 },
    matchScore: 0.7,
    source: "color_shape_detection",
    confidence: "medium",
    needsReview: true,
    ...partial,
  };
}

const BASE_FACTS = factsWith({
  extractedItems: [
    item({ id: "i1", title: "El.zásuvka", category: "socket", quantity: 4, quantitySource: "legend" }),
    item({ id: "i2", title: "Visiace svietidlo", category: "lighting", quantity: 8 }),
    item({ id: "i3", title: "LED pás v SDK", category: "led_strip", quantity: 10.1, unit: "m" }),
  ],
  visualDetections: [visualDet({ id: "v1" }), visualDet({ id: "v2" }), visualDet({ id: "v3" })],
});

const OPTS = {
  fileName: FILE,
  pageSizeByPage: { 1: { width: 2526, height: 3573 } },
};

// 1. every position requires evidence
it("every estimator position has at least one evidence anchor", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  expect(positions.length).toBeGreaterThan(0);
  for (const p of positions) {
    expect(p.evidenceAnchors.length).toBeGreaterThan(0);
    for (const a of p.evidenceAnchors) {
      expect(a.fileName).toBeTruthy();
      expect(a.page).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(a.confidence);
    }
  }
});

// 2. position codes by trade/category
it("generates position codes by trade and category (E-ZAS-001, E-VYP-001, …)", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const codeOf = (label: string) =>
    positions.find((p) => p.label.includes(label))?.positionCode;
  expect(codeOf("El.zásuvka")).toBe("E-ZAS-001");
  expect(codeOf("Visiace svietidlo")).toBe("E-SV-001");
  expect(codeOf("LED pás")).toBe("E-LED-001");
  expect(codeOf("Vypínač")).toBe("E-VYP-001");
  // Stable across a re-run on identical input.
  const again = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  expect(again.map((p) => p.positionCode)).toEqual(positions.map((p) => p.positionCode));
});

// 3. selection maps list row ↔ PDF annotation state
it("selecting a position toggles the linked PDF annotation and back", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const annotations = buildPdfOverlayAnnotations(positions);
  const switchPos = positions.find((p) => p.category === "switch")!;
  const selected = applyAnnotationSelection(annotations, switchPos.id);
  const mine = selected.filter((a) => a.positionId === switchPos.id);
  expect(mine.length).toBeGreaterThan(0);
  expect(mine.every((a) => a.selected)).toBe(true);
  expect(selected.filter((a) => a.positionId !== switchPos.id).every((a) => !a.selected)).toBe(
    true
  );
  // Clicking the annotation resolves back to the position.
  expect(positionIdForAnnotation(selected, mine[0].id)).toBe(switchPos.id);
});

// 4. + 5. filters
it("filters return only price_missing items", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS).map((p, i) =>
    i === 0 ? applyManualPriceToPosition(p, 12.5) : p
  );
  const missing = filterEstimatorPositions(positions, { quick: "price_missing" });
  expect(missing.length).toBe(positions.length - 1);
  expect(missing.every((p) => p.priceStatus === "price_missing")).toBe(true);
});

it("filters return only needs_review items", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const review = filterEstimatorPositions(positions, { quick: "needs_review" });
  expect(review.length).toBeGreaterThan(0);
  expect(review.every((p) => p.reviewStatus === "needs_review")).toBe(true);
});

// 6. grouped row with multiple anchors
it("a grouped visual position contains multiple PDF anchors with bbox", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const visual = positions.find((p) => p.quantitySource === "visual_detection")!;
  expect(visual.evidenceAnchors.length).toBe(3);
  expect(visual.evidenceAnchors.every((a) => a.bbox != null)).toBe(true);
  // Pixel bboxes were normalized into 0..1 page space.
  for (const a of visual.evidenceAnchors) {
    expect(a.bbox!.x).toBeLessThanOrEqual(1);
    expect(a.bbox!.y).toBeLessThanOrEqual(1);
  }
});

// 7. manual price
it("manual price sets priceStatus=manual_price and never accepts 0 €", () => {
  const [p] = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const priced = applyManualPriceToPosition(p, 9.9, "EUR");
  expect(priced.priceStatus).toBe("manual_price");
  expect(priced.unitPrice).toBe(9.9);
  expect(priced.totalPrice).toBeCloseTo(9.9 * p.quantity);
  // 0 € is rejected — position stays price_missing.
  expect(applyManualPriceToPosition(p, 0).priceStatus).toBe("price_missing");
});

// 8. catalog/pricebook price
it("catalog price sets supplier_catalog/company_pricebook with product metadata", () => {
  const [p] = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const catalog = applyCatalogPriceToPosition(p, {
    unitPrice: 4.2,
    sourceType: "supplier_catalog",
    productName: "Legrand Valena zásuvka",
    supplierId: "supplier-x",
  });
  expect(catalog.priceStatus).toBe("supplier_catalog");
  expect(catalog.productRef?.supplierId).toBe("supplier-x");
  const pricebook = applyCatalogPriceToPosition(p, {
    unitPrice: 3.8,
    sourceType: "company_pricebook",
  });
  expect(pricebook.priceStatus).toBe("company_pricebook");
});

it("apply price to similar fills only price_missing rows of same category", () => {
  const positions = buildEstimatorPositionsFromFacts(
    factsWith({
      extractedItems: [
        item({ id: "a", title: "El.zásuvka", category: "socket", quantity: 4 }),
        item({ id: "b", title: "2 zásuvka", category: "socket", quantity: 2 }),
        item({ id: "c", title: "Visiace svietidlo", category: "lighting", quantity: 1 }),
      ],
    }),
    OPTS
  );
  const source = applyManualPriceToPosition(
    positions.find((p) => p.label === "El.zásuvka")!,
    5
  );
  const applied = applyPriceToSimilarPositions(positions, source);
  const otherSocket = applied.find((p) => p.label === "2 zásuvka")!;
  expect(otherSocket.unitPrice).toBe(5);
  expect(otherSocket.priceStatus).toBe("manual_price");
  expect(applied.find((p) => p.category === "lighting")!.priceStatus).toBe("price_missing");
});

// 9. price_missing blocks fixed quote
it("price_missing blocks the fixed quote", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const safety = positionsBlockFixedQuote(positions);
  expect(safety.blocked).toBe(true);
  expect(safety.reasons.join(" ")).toMatch(/nemá cenu/);
});

// 10. excluded item requires reason
it("ignoring/excluding a position requires a reason", () => {
  const [p] = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  expect(() => excludePositionFromQuote(p, "")).toThrow();
  expect(() => ignorePosition(p, "  ")).toThrow();
  const excluded = excludePositionFromQuote(p, "duplicate");
  expect(excluded.reviewStatus).toBe("excluded");
  expect(excluded.reviewReason).toBe("duplicate");
});

// 11. confirmed visual detection becomes eligible
it("a confirmed visual detection becomes eligible for takeoff and (with price) fixed quote", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const visual = positions.find((p) => p.quantitySource === "visual_detection")!;
  expect(visual.reviewStatus).toBe("needs_review");
  const confirmed = confirmPosition({ ...visual, quantity: 3 });
  expect(confirmed.reviewStatus).toBe("confirmed");
  expect(confirmed.evidenceAnchors.every((a) => !a.needsReview)).toBe(true);
  expect(confirmed.evidenceAnchors.every((a) => a.sourceType === "user_confirmed")).toBe(true);
  expect(isPositionFixedQuoteEligible(confirmed)).toBe(false); // price still missing
  const priced = applyManualPriceToPosition(confirmed, 7.5);
  expect(isPositionFixedQuoteEligible(priced)).toBe(true);
});

// 12. unconfirmed visual detection cannot be a fixed quote line
it("an unconfirmed visual detection can never become a fixed quote line", () => {
  const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
  const visual = positions.find((p) => p.quantitySource === "visual_detection")!;
  expect(isPositionFixedQuoteEligible(visual)).toBe(false);
  const priced = applyManualPriceToPosition(visual, 7.5);
  expect(isPositionFixedQuoteEligible(priced)).toBe(false); // still needs_review
  const safety = positionsBlockFixedQuote([priced]);
  expect(safety.blocked).toBe(true);
  expect(safety.reasons.join(" ")).toMatch(/vizuálnych detekcií nie je potvrdených/i);
});

// extra coverage: sorting + summary + customer supplied
describe("sorting, summary and customer supplied", () => {
  it("sorts by quantity and by positionCode", () => {
    const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
    const byQty = sortEstimatorPositions(positions, "quantity", "desc");
    expect(byQty[0].quantity).toBeGreaterThanOrEqual(byQty[byQty.length - 1].quantity);
    const byCode = sortEstimatorPositions(positions, "positionCode");
    expect([...byCode.map((p) => p.positionCode)].sort()).toEqual(
      byCode.map((p) => p.positionCode)
    );
  });

  it("customer supplied clears price and is not price_missing", () => {
    const [p] = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
    const supplied = markPositionCustomerSupplied(p);
    expect(supplied.priceStatus).toBe("customer_supplied");
    expect(supplied.unitPrice).toBeUndefined();
  });

  it("summary counts anchors, bboxes and review state", () => {
    const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
    const s = summarizeEstimatorPositions(positions);
    expect(s.total).toBe(positions.length);
    expect(s.anchors).toBeGreaterThanOrEqual(positions.length);
    expect(s.withBbox + s.withoutBbox).toBe(s.total);
    expect(s.priceMissing).toBeGreaterThan(0);
  });

  it("ignored/excluded positions disappear from annotations", () => {
    const positions = buildEstimatorPositionsFromFacts(BASE_FACTS, OPTS);
    const visual = positions.find((p) => p.quantitySource === "visual_detection")!;
    const withoutVisual = positions.map((p) =>
      p.id === visual.id ? ignorePosition(p, "false_detection") : p
    );
    const anns = buildPdfOverlayAnnotations(withoutVisual);
    expect(anns.some((a) => a.positionId === visual.id)).toBe(false);
  });
});

// EstimatorPosition type is exercised as return type — keep import used.
const _typeCheck: EstimatorPosition[] = [];
void _typeCheck;
