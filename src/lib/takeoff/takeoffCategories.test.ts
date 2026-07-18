import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLOR_PALETTE,
  categoryColorForKey,
  categoryKeyForLabel,
  groupConfirmedByCategory,
} from "./takeoffCategories";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";

function makeCandidate(
  label: string,
  status: AnalyzeRegionCandidateDto["status"] = "confirmed"
): AnalyzeRegionCandidateDto {
  return {
    id: `c_${label}_${Math.random().toString(36).slice(2, 8)}`,
    page_number: 1,
    bbox_pdf: [0, 0, 1, 1],
    bbox_px: [0, 0, 0, 0],
    color_layer: "orange",
    kind: "symbol_candidate",
    label_suggestions: [{ label, confidence: 0.99 }],
    nearby_text: null,
    confidence: 0.99,
    source: "manual",
    status,
    preview_image_url: null,
    normalized_position: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
  };
}

describe("categoryKeyForLabel", () => {
  it("normalizes case and whitespace so the same position is one category", () => {
    expect(categoryKeyForLabel("Svetlo LED")).toBe("svetlo led");
    expect(categoryKeyForLabel("  svetlo   LED ")).toBe("svetlo led");
    expect(categoryKeyForLabel("Svetlo LED")).toBe(categoryKeyForLabel("SVETLO led"));
  });
});

describe("categoryColorForKey", () => {
  it("is stable for the same key and comes from the palette", () => {
    const a = categoryColorForKey("svetlo led");
    expect(categoryColorForKey("svetlo led")).toBe(a);
    expect(CATEGORY_COLOR_PALETTE).toContain(a);
  });

  it("gives different labels different colors (typical case)", () => {
    const colors = new Set(
      ["svetlo", "vypínač", "zásuvka 230v", "led pás"].map(categoryColorForKey)
    );
    // Hash collisions are allowed in principle, but the common electrical
    // labels must land on distinct palette entries.
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });
});

describe("groupConfirmedByCategory", () => {
  it("groups confirmed marks by normalized label with counts, biggest first", () => {
    const candidates = [
      makeCandidate("Svetlo"),
      makeCandidate("svetlo"),
      makeCandidate("Svetlo "),
      makeCandidate("Vypínač"),
      makeCandidate("Vypínač"),
      makeCandidate("Zásuvka"),
    ];
    const groups = groupConfirmedByCategory(candidates);
    expect(groups.map((g) => [g.label, g.candidates.length])).toEqual([
      ["Svetlo", 3],
      ["Vypínač", 2],
      ["Zásuvka", 1],
    ]);
  });

  it("ignores non-confirmed candidates", () => {
    const candidates = [
      makeCandidate("Svetlo"),
      makeCandidate("Svetlo", "candidate"),
      makeCandidate("Svetlo", "rejected"),
    ];
    const groups = groupConfirmedByCategory(candidates);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.candidates).toHaveLength(1);
  });

  it("keeps the first-seen display label and assigns a stable color", () => {
    const groups = groupConfirmedByCategory([
      makeCandidate("Zásuvka 230V"),
      makeCandidate("zásuvka 230v"),
    ]);
    expect(groups[0]!.label).toBe("Zásuvka 230V");
    expect(groups[0]!.color).toBe(categoryColorForKey("zásuvka 230v"));
  });
});
