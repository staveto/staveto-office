import { describe, expect, it } from "vitest";
import { mergeRasterAndTemplateCandidates } from "./regionCandidateMerge";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";

function cand(overrides?: Partial<AnalyzeRegionCandidateDto>): AnalyzeRegionCandidateDto {
  return {
    id: "cand_1",
    page_number: 1,
    bbox_pdf: [0, 0, 10, 10],
    bbox_px: [0, 0, 20, 20],
    color_layer: "green",
    kind: "symbol_candidate",
    label_suggestions: [{ label: "zásuvka", confidence: 0.6 }],
    nearby_text: null,
    confidence: 0.6,
    source: "opencv",
    status: "candidate",
    preview_image_url: null,
    normalized_position: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
    ...overrides,
  };
}

describe("mergeRasterAndTemplateCandidates", () => {
  it("merges an overlapping same-color template match into the raster candidate as 'mixed'", () => {
    const raster = cand({ id: "cand_raster_1", confidence: 0.5, status: "candidate" });
    const template = cand({
      id: "cand_tpl_1",
      source: "template_match",
      confidence: 0.9,
      status: "probable",
      label_suggestions: [{ label: "zásuvka (šablóna)", confidence: 0.9 }],
    });

    const result = mergeRasterAndTemplateCandidates({
      rasterCandidates: [raster],
      templateCandidates: [template],
    });

    expect(result.candidates).toHaveLength(1);
    const merged = result.candidates[0]!;
    expect(merged.source).toBe("mixed");
    expect(merged.id).toBe("cand_raster_1"); // keeps the raster (already-persisted) id
    expect(merged.confidence).toBe(0.9);
    expect(merged.status).toBe("probable");
    // Both label suggestions preserved (union), best confidence first.
    const labels = merged.label_suggestions.map((l) => l.label);
    expect(labels).toContain("zásuvka");
    expect(labels).toContain("zásuvka (šablóna)");
    expect(result.mergedWithRasterCount).toBe(1);
  });

  it("does not merge overlapping candidates of different color layers", () => {
    const rasterRed = cand({ id: "cand_red", color_layer: "red" });
    const templateGreen = cand({
      id: "cand_tpl_green",
      source: "template_match",
      color_layer: "green",
    });

    const result = mergeRasterAndTemplateCandidates({
      rasterCandidates: [rasterRed],
      templateCandidates: [templateGreen],
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.some((c) => c.source === "mixed")).toBe(false);
    expect(result.mergedWithRasterCount).toBe(0);
  });

  it("keeps a non-overlapping template match as its own template_match candidate", () => {
    const raster = cand({ id: "cand_raster_1" });
    const template = cand({
      id: "cand_tpl_far",
      source: "template_match",
      normalized_position: { x: 0.8, y: 0.8, width: 0.02, height: 0.02 },
    });

    const result = mergeRasterAndTemplateCandidates({
      rasterCandidates: [raster],
      templateCandidates: [template],
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.find((c) => c.id === "cand_tpl_far")?.source).toBe("template_match");
  });

  it("dedupes duplicate template matches against each other before merging", () => {
    const templateA = cand({
      id: "cand_tpl_a",
      source: "template_match",
      confidence: 0.7,
      label_suggestions: [{ label: "zásuvka", confidence: 0.7 }],
    });
    const templateB = cand({
      id: "cand_tpl_b",
      source: "template_match",
      confidence: 0.85,
      label_suggestions: [{ label: "zásuvka (šablóna)", confidence: 0.85 }],
      normalized_position: { x: 0.405, y: 0.405, width: 0.02, height: 0.02 },
    });

    const result = mergeRasterAndTemplateCandidates({
      rasterCandidates: [],
      templateCandidates: [templateA, templateB],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.dedupedTemplateCount).toBe(1);
    // The surviving candidate keeps the higher-confidence template's id/bbox.
    expect(result.candidates[0]!.id).toBe("cand_tpl_b");
  });

  it("returns the raw template matches before dedupe for debug purposes", () => {
    const templateA = cand({ id: "cand_tpl_a", source: "template_match" });
    const templateB = cand({
      id: "cand_tpl_b",
      source: "template_match",
      normalized_position: { x: 0.402, y: 0.402, width: 0.02, height: 0.02 },
    });

    const result = mergeRasterAndTemplateCandidates({
      rasterCandidates: [],
      templateCandidates: [templateA, templateB],
    });

    expect(result.templateMatchesBeforeDedupe).toHaveLength(2);
    expect(result.candidates).toHaveLength(1);
  });

  it("never invents confirmed status — merged candidates stay review-only", () => {
    const raster = cand({ id: "cand_raster_1", confidence: 0.95, status: "probable" });
    const template = cand({
      id: "cand_tpl_1",
      source: "template_match",
      confidence: 0.95,
      status: "probable",
    });

    const result = mergeRasterAndTemplateCandidates({
      rasterCandidates: [raster],
      templateCandidates: [template],
    });

    expect(result.candidates.every((c) => c.status !== "confirmed")).toBe(true);
  });
});
