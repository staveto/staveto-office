import { describe, expect, it } from "vitest";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";
import {
  attachNearbyTextToCandidates,
  filterCandidatesOverlappingOcrText,
  isDimensionLikeText,
  normalizedRectGap,
  selectNearbyText,
  type OcrTextLine,
} from "./ocrNearbyText";

const CAND_BBOX = { x: 0.4, y: 0.4, width: 0.02, height: 0.02 };

function line(
  text: string,
  x: number,
  y: number,
  confidence = 0.9,
  size = 0.02
): OcrTextLine {
  return { text, confidence, bbox: { x, y, width: size * text.length * 0.4, height: size } };
}

function candidate(overrides?: Partial<AnalyzeRegionCandidateDto>): AnalyzeRegionCandidateDto {
  return {
    id: "cand_1",
    page_number: 1,
    bbox_pdf: [0, 0, 10, 10],
    bbox_px: [0, 0, 20, 20],
    color_layer: "green",
    kind: "symbol_candidate",
    label_suggestions: [{ label: "zásuvka", confidence: 0.8 }],
    nearby_text: null,
    confidence: 0.8,
    source: "opencv",
    status: "probable",
    preview_image_url: null,
    normalized_position: CAND_BBOX,
    ...overrides,
  };
}

describe("normalizedRectGap", () => {
  it("is zero for overlapping rects and grows with distance", () => {
    expect(normalizedRectGap(CAND_BBOX, { x: 0.41, y: 0.41, width: 0.02, height: 0.02 })).toBe(0);
    const far = normalizedRectGap(CAND_BBOX, { x: 0.9, y: 0.4, width: 0.02, height: 0.02 });
    expect(far).toBeGreaterThan(0.4);
  });
});

describe("isDimensionLikeText", () => {
  it("flags bare measurements but not labels", () => {
    expect(isDimensionLikeText("2400")).toBe(true);
    expect(isDimensionLikeText("350 x 200")).toBe(true);
    expect(isDimensionLikeText("1.200,5")).toBe(true);
    expect(isDimensionLikeText("Zásuvka 230V")).toBe(false);
    expect(isDimensionLikeText("WC")).toBe(false);
  });
});

describe("selectNearbyText", () => {
  it("picks text close to the candidate bbox", () => {
    const lines = [line("230V zásuvka", 0.43, 0.4)];
    expect(selectNearbyText(CAND_BBOX, lines)).toBe("230V zásuvka");
  });

  it("ignores far legend text", () => {
    const lines = [
      line("LEGENDA: zásuvka jednoduchá", 0.05, 0.9),
      line("vypínač sériový", 0.05, 0.93),
    ];
    expect(selectNearbyText(CAND_BBOX, lines)).toBeNull();
  });

  it("ignores bare dimension strings next to the candidate", () => {
    const lines = [line("2400", 0.43, 0.4)];
    expect(selectNearbyText(CAND_BBOX, lines)).toBeNull();
  });

  it("ignores low-confidence lines", () => {
    const lines = [line("šum textu", 0.43, 0.4, 0.1)];
    expect(selectNearbyText(CAND_BBOX, lines)).toBeNull();
  });

  it("joins nearest lines first and respects the length cap", () => {
    const lines = [
      line("A2", 0.43, 0.4),
      line("kuchyňa", 0.45, 0.42),
      line("x".repeat(200), 0.44, 0.41, 0.9, 0.01),
    ];
    const out = selectNearbyText(CAND_BBOX, lines);
    expect(out).toContain("A2");
    expect((out ?? "").length).toBeLessThanOrEqual(120);
  });
});

describe("attachNearbyTextToCandidates", () => {
  it("attaches nearby OCR text to the candidate", () => {
    const out = attachNearbyTextToCandidates(
      [candidate()],
      { fullText: "", lines: [line("230V", 0.43, 0.4)] }
    );
    expect(out[0]!.nearby_text).toBe("230V");
  });

  it("leaves candidates valid when OCR returns nothing", () => {
    const out = attachNearbyTextToCandidates([candidate()], null);
    expect(out[0]!.nearby_text).toBeNull();
    expect(out[0]!.status).toBe("probable");
    expect(out[0]!.label_suggestions).toHaveLength(1);
  });

  it("never touches confirmed or rejected candidates", () => {
    const out = attachNearbyTextToCandidates(
      [
        candidate({ id: "c_conf", status: "confirmed" }),
        candidate({ id: "c_rej", status: "rejected" }),
      ],
      { fullText: "", lines: [line("230V", 0.43, 0.4)] }
    );
    expect(out[0]!.nearby_text).toBeNull();
    expect(out[1]!.nearby_text).toBeNull();
  });

  it("does not overwrite existing nearby_text (e.g. operator notes)", () => {
    const out = attachNearbyTextToCandidates(
      [candidate({ nearby_text: "poznámka operátora" })],
      { fullText: "", lines: [line("230V", 0.43, 0.4)] }
    );
    expect(out[0]!.nearby_text).toBe("poznámka operátora");
  });

  it("only changes nearby_text — status, labels and confidence stay intact", () => {
    const src = candidate();
    const out = attachNearbyTextToCandidates(
      [src],
      { fullText: "", lines: [line("230V", 0.43, 0.4)] }
    )[0]!;
    expect(out.status).toBe(src.status);
    expect(out.confidence).toBe(src.confidence);
    expect(out.label_suggestions).toEqual(src.label_suggestions);
    expect(out.source).toBe(src.source);
  });
});

describe("filterCandidatesOverlappingOcrText", () => {
  it("rejects a raster candidate that sits mostly inside a real OCR text line", () => {
    const textLine: OcrTextLine = {
      text: "Zásuvka 230V",
      confidence: 0.9,
      bbox: { x: 0.39, y: 0.395, width: 0.06, height: 0.03 },
    };
    const result = filterCandidatesOverlappingOcrText([candidate()], {
      fullText: "",
      lines: [textLine],
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.rejectedIds).toEqual(["cand_1"]);
  });

  it("keeps a candidate overlapping a purely numeric OCR line (circuit callouts stay candidates)", () => {
    const numericLine: OcrTextLine = {
      text: "12",
      confidence: 0.9,
      bbox: { x: 0.39, y: 0.395, width: 0.06, height: 0.03 },
    };
    const result = filterCandidatesOverlappingOcrText([candidate()], {
      fullText: "",
      lines: [numericLine],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.rejectedIds).toHaveLength(0);
  });

  it("keeps a candidate that is only near, not mostly inside, an OCR text line", () => {
    const farLine: OcrTextLine = {
      text: "Zásuvka",
      confidence: 0.9,
      bbox: { x: 0.6, y: 0.6, width: 0.06, height: 0.03 },
    };
    const result = filterCandidatesOverlappingOcrText([candidate()], {
      fullText: "",
      lines: [farLine],
    });
    expect(result.candidates).toHaveLength(1);
  });

  it("never rejects confirmed, rejected, manual or template_match candidates", () => {
    const textLine: OcrTextLine = {
      text: "Zásuvka 230V",
      confidence: 0.9,
      bbox: { x: 0.39, y: 0.395, width: 0.06, height: 0.03 },
    };
    const candidates = [
      candidate({ id: "c_confirmed", status: "confirmed" }),
      candidate({ id: "c_rejected", status: "rejected" }),
      candidate({ id: "c_manual", source: "manual" }),
      candidate({ id: "c_template", source: "template_match" }),
      candidate({ id: "c_mixed", source: "mixed" }),
    ];
    const result = filterCandidatesOverlappingOcrText(candidates, {
      fullText: "",
      lines: [textLine],
    });
    expect(result.candidates).toHaveLength(candidates.length);
    expect(result.rejectedIds).toHaveLength(0);
  });

  it("is a no-op when OCR returns nothing", () => {
    const result = filterCandidatesOverlappingOcrText([candidate()], null);
    expect(result.candidates).toHaveLength(1);
    expect(result.rejectedIds).toHaveLength(0);
  });
});
