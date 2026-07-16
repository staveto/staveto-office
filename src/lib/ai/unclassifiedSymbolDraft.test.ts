import { describe, expect, it } from "vitest";
import type {
  EstimatorPosition,
  UnclassifiedSymbolDraft,
} from "@/types/estimatorPositions";
import {
  buildSymbolDraftFromMark,
  createManualEstimatorPosition,
  createPositionFromSymbolDraft,
  nextPositionCode,
  possibleTypesForColorHint,
} from "./unclassifiedSymbolDraft";
import {
  addManualMarkToPosition,
  addAndConfirmSimilarMarksToPosition,
  addSimilarCandidateMarksToPosition,
  applyMarkCountAsQuantity,
  confirmSimilarCandidateMarks,
  isManualMarkAnchor,
  manualMarkCount,
  positionsBlockFixedQuote,
  removeSimilarCandidateMarks,
  similarCandidateAnchors,
} from "./estimatorPositions";

const BBOX = { x: 0.4, y: 0.5, width: 0.02, height: 0.02 };

function makeDraft(over: Partial<UnclassifiedSymbolDraft> = {}): UnclassifiedSymbolDraft {
  const draft = buildSymbolDraftFromMark({
    page: 1,
    bbox: BBOX,
    colorHint: "green",
    confidence: "high",
  });
  if (!draft) throw new Error("expected draft");
  return { ...draft, ...over };
}

describe("buildSymbolDraftFromMark (PDF-first click)", () => {
  it("creates a draft from a click without any selected position", () => {
    const draft = buildSymbolDraftFromMark({
      page: 2,
      bbox: BBOX,
      colorHint: "green",
      confidence: "high",
    });
    expect(draft).not.toBeNull();
    expect(draft!.status).toBe("draft");
    expect(draft!.page).toBe(2);
    expect(draft!.center.x).toBeCloseTo(0.41, 5);
    expect(draft!.possibleTypes[0]).toBe("socket");
  });

  it("suggests types by color hint", () => {
    expect(possibleTypesForColorHint("red")[0]).toBe("switch");
    expect(possibleTypesForColorHint("orange")[0]).toBe("lighting");
    expect(possibleTypesForColorHint("unknown")).toEqual(["unknown"]);
  });

  it("outside plan click creates no draft (and therefore no position)", () => {
    const draft = buildSymbolDraftFromMark({
      page: 1,
      bbox: BBOX,
      colorHint: "green",
      outsidePlan: true,
    });
    expect(draft).toBeNull();
  });

  it("draft alone does not create a quote line", () => {
    const positions: EstimatorPosition[] = [];
    makeDraft();
    // Drafts are UI-only — nothing enters the positions/takeoff list.
    expect(positions).toHaveLength(0);
    expect(positionsBlockFixedQuote(positions).blocked).toBe(false);
  });
});

describe("createPositionFromSymbolDraft (classification)", () => {
  it("creates a user-confirmed position with quantity 1 and evidence anchor", () => {
    const { position } = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "socket" },
      []
    );
    expect(position.positionCode).toBe("E-ZAS-001");
    expect(position.quantity).toBe(1);
    expect(position.unit).toBe("ks");
    expect(position.quantitySource).toBe("manual");
    expect(position.reviewStatus).toBe("confirmed");
    expect(position.priceStatus).toBe("price_missing");
    expect(position.evidenceAnchors).toHaveLength(1);
    const anchor = position.evidenceAnchors[0]!;
    expect(anchor.sourceType).toBe("user_confirmed");
    expect(anchor.markStatus).toBe("confirmed");
    expect(anchor.bbox).toEqual(BBOX);
    expect(isManualMarkAnchor(anchor)).toBe(true);
    expect(manualMarkCount(position)).toBe(1);
  });

  it("generates codes per category and increments existing sequences", () => {
    const existing = [
      { positionCode: "E-ZAS-003" },
      { positionCode: "E-VYP-001" },
    ] as EstimatorPosition[];
    expect(nextPositionCode("E-ZAS", existing)).toBe("E-ZAS-004");
    expect(nextPositionCode("E-SV", existing)).toBe("E-SV-001");

    const sw = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "switch" },
      existing
    ).position;
    expect(sw.positionCode).toBe("E-VYP-002");
    const led = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "led_strip" },
      existing
    ).position;
    expect(led.positionCode).toBe("E-LED-001");
    expect(led.unit).toBe("m");
    const unk = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "unknown" },
      existing
    ).position;
    expect(unk.positionCode).toBe("E-UNK-001");
  });

  it("applies custom label, room and scope", () => {
    const { position } = createPositionFromSymbolDraft(
      makeDraft(),
      {
        category: "socket",
        label: "Zásuvka 230V pri TV",
        roomName: "Obývačka",
        scope: "customer_supplied",
      },
      []
    );
    expect(position.label).toBe("Zásuvka 230V pri TV");
    expect(position.roomName).toBe("Obývačka");
    expect(position.priceStatus).toBe("customer_supplied");
  });

  it("out-of-scope classification is excluded from the quote", () => {
    const { position } = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "socket", scope: "out_of_scope" },
      []
    );
    expect(position.reviewStatus).toBe("excluded");
    // Excluded positions never block the fixed quote.
    expect(positionsBlockFixedQuote([position]).blocked).toBe(false);
  });

  it("creates assembly + product intents when a template exists", () => {
    const { position, assembly, productSearchIntents } =
      createPositionFromSymbolDraft(makeDraft(), { category: "socket" }, []);
    expect(assembly).not.toBeNull();
    expect(position.assemblyTemplateId).toBe(assembly!.assemblyTemplateId);
    expect(productSearchIntents.length).toBeGreaterThan(0);
    expect(position.productSearchIntentIds).toEqual(
      productSearchIntents.map((i) => i.takeoffItemId)
    );
  });
});

describe("similar-symbol candidates (find same in plan)", () => {
  function positionWithCandidates() {
    const base = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "socket" },
      []
    ).position;
    return addSimilarCandidateMarksToPosition(base, [
      {
        page: 1,
        bbox: { x: 0.6, y: 0.5, width: 0.02, height: 0.02 },
        matchScore: 0.9,
        fileName: "plan.pdf",
      },
      {
        page: 1,
        bbox: { x: 0.7, y: 0.3, width: 0.02, height: 0.02 },
        matchScore: 0.87,
        fileName: "plan.pdf",
      },
    ]);
  }

  it("candidates are needsReview and do not affect quantity", () => {
    const pos = positionWithCandidates();
    expect(similarCandidateAnchors(pos)).toHaveLength(2);
    expect(pos.quantity).toBe(1);
    expect(manualMarkCount(pos)).toBe(1);
    // Even re-applying mark count keeps unconfirmed candidates out.
    expect(applyMarkCountAsQuantity(pos).quantity).toBe(1);
  });

  it("confirming candidates converts them to marks and updates quantity", () => {
    const confirmed = confirmSimilarCandidateMarks(positionWithCandidates());
    expect(similarCandidateAnchors(confirmed)).toHaveLength(0);
    expect(manualMarkCount(confirmed)).toBe(3);
    expect(confirmed.quantity).toBe(3);
    expect(confirmed.quantitySource).toBe("manual");
  });

  it("addAndConfirmSimilarMarks bumps quantity in one step", () => {
    const base = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "socket" },
      []
    ).position;
    const withQty = applyMarkCountAsQuantity(base);
    const next = addAndConfirmSimilarMarksToPosition(withQty, [
      {
        page: 1,
        bbox: { x: 0.5, y: 0.5, width: 0.02, height: 0.02 },
        matchScore: 0.9,
        fileName: "plan.pdf",
      },
      {
        page: 2,
        bbox: { x: 0.3, y: 0.4, width: 0.02, height: 0.02 },
        matchScore: 0.88,
        fileName: "plan.pdf",
      },
    ]);
    expect(manualMarkCount(next)).toBe(3);
    expect(next.quantity).toBe(3);
    expect(similarCandidateAnchors(next)).toHaveLength(0);
  });

  it("dismissing candidates removes them without counting", () => {
    const dismissed = removeSimilarCandidateMarks(positionWithCandidates());
    expect(similarCandidateAnchors(dismissed)).toHaveLength(0);
    expect(manualMarkCount(dismissed)).toBe(1);
    expect(dismissed.quantity).toBe(1);
  });

  it("pending similar candidates block fixed quote", () => {
    const withCandidates = positionWithCandidates();
    const priced = {
      ...withCandidates,
      priceStatus: "manual_price" as const,
      unitPrice: 5,
      totalPrice: 5,
    };
    const safety = positionsBlockFixedQuote([priced]);
    expect(safety.blocked).toBe(true);
    expect(safety.reasons.join(" ")).toMatch(/kandidátov/i);
  });
});

describe("createManualEstimatorPosition", () => {
  it("creates a priced-ready line without PDF bbox", () => {
    const position = createManualEstimatorPosition(
      { label: "Krabica KU68", category: "installation_box", quantity: 4 },
      []
    );
    expect(position.evidenceAnchors).toHaveLength(0);
    expect(position.quantity).toBe(4);
    expect(position.quantitySource).toBe("manual");
    expect(position.priceStatus).toBe("price_missing");
    expect(position.reviewStatus).toBe("confirmed");
    expect(position.label).toBe("Krabica KU68");
  });
});

describe("side-panel-first fallback still works", () => {
  it("addManualMarkToPosition keeps counting marks on an existing position", () => {
    const base = createPositionFromSymbolDraft(
      makeDraft(),
      { category: "socket" },
      []
    ).position;
    const marked = addManualMarkToPosition(base, {
      page: 1,
      bbox: { x: 0.2, y: 0.2, width: 0.02, height: 0.02 },
      fileName: "plan.pdf",
    });
    expect(manualMarkCount(marked)).toBe(2);
    expect(applyMarkCountAsQuantity(marked).quantity).toBe(2);
  });
});
