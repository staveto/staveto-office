import { describe, expect, it } from "vitest";
import type { AnalyzeRegionCandidateDto } from "@/types/pdfTakeoff";
import {
  findConfirmedPeersToAssign,
  isGenericTypeLabel,
} from "@/lib/takeoff/similarCategoryAssign";

function cand(
  patch: Partial<AnalyzeRegionCandidateDto> & { id: string }
): AnalyzeRegionCandidateDto {
  return {
    page_number: 1,
    bbox_pdf: [0, 0, 10, 10],
    bbox_px: [0, 0, 10, 10],
    color_layer: "green",
    kind: "symbol_candidate",
    label_suggestions: [{ label: "zásuvka", confidence: 0.95 }],
    nearby_text: null,
    confidence: 0.95,
    source: "template_match",
    status: "confirmed",
    preview_image_url: null,
    normalized_position: { x: 0.1, y: 0.1, width: 0.02, height: 0.02 },
    ...patch,
  };
}

describe("isGenericTypeLabel", () => {
  it("treats zásuvka as generic for socket", () => {
    expect(isGenericTypeLabel("zásuvka", "socket")).toBe(true);
    expect(isGenericTypeLabel("Zásuvka", "socket")).toBe(true);
  });

  it("treats a product name as non-generic", () => {
    expect(
      isGenericTypeLabel("Valena Zásuvka 230V S Detskou Ochranou, Biela", "socket")
    ).toBe(false);
  });
});

describe("findConfirmedPeersToAssign", () => {
  const target = "Valena Zásuvka 230V S Detskou Ochranou, Biela";

  it("picks confirmed generic sockets and skips the reference / product rows", () => {
    const peers = findConfirmedPeersToAssign({
      targetLabel: target,
      symbolType: "socket",
      excludeCandidateId: "valena_1",
      candidates: [
        cand({
          id: "valena_1",
          label_suggestions: [{ label: target, confidence: 1 }],
          source: "manual",
        }),
        cand({ id: "gen_1" }),
        cand({ id: "gen_2", source: "gemini" }),
        cand({
          id: "switch_1",
          color_layer: "red",
          label_suggestions: [{ label: "vypínač", confidence: 0.9 }],
        }),
        cand({
          id: "other_product",
          label_suggestions: [{ label: "Iná zásuvka", confidence: 1 }],
        }),
      ],
    });

    expect(peers.map((p) => p.id).sort()).toEqual(["gen_1", "gen_2"]);
  });

  it("does nothing when the target itself is still the generic type name", () => {
    const peers = findConfirmedPeersToAssign({
      targetLabel: "zásuvka",
      symbolType: "socket",
      candidates: [cand({ id: "gen_1" })],
    });
    expect(peers).toHaveLength(0);
  });
});
