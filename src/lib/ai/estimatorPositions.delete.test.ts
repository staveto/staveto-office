import { describe, expect, it } from "vitest";
import type { EstimatorPosition } from "@/types/estimatorPositions";
import {
  addSimilarCandidateMarksToPosition,
  applyMarkCountAsQuantity,
  filterSimilarCandidateMarks,
  manualMarkCount,
  planRemoveEvidenceAnchor,
  removeCandidateAnchorsBulk,
  removeCountedMarkKeepPosition,
  removeEvidenceAnchorsBulk,
  renamePositionLabel,
  similarCandidateAnchors,
} from "./estimatorPositions";
import { createPositionFromSymbolDraft } from "./unclassifiedSymbolDraft";
import { buildSymbolDraftFromMark } from "./unclassifiedSymbolDraft";

function basePosition(): EstimatorPosition {
  const draft = buildSymbolDraftFromMark({
    page: 1,
    bbox: { x: 0.2, y: 0.2, width: 0.02, height: 0.02 },
  })!;
  return createPositionFromSymbolDraft(draft, { category: "socket", label: "Zásuvka" }, [])
    .position;
}

describe("delete / bulk / rename marking controls", () => {
  it("deletes a candidate without changing quantity", () => {
    const withCand = addSimilarCandidateMarksToPosition(basePosition(), [
      {
        page: 1,
        bbox: { x: 0.5, y: 0.5, width: 0.02, height: 0.02 },
        matchScore: 0.92,
        fileName: "plan.pdf",
      },
    ]);
    expect(withCand.quantity).toBe(1);
    const cand = similarCandidateAnchors(withCand)[0]!;
    const plan = planRemoveEvidenceAnchor(withCand, cand.id);
    expect(plan?.kind).toBe("candidate");
    if (plan?.kind !== "candidate") return;
    expect(similarCandidateAnchors(plan.position)).toHaveLength(0);
    expect(plan.position.quantity).toBe(1);
  });

  it("deletes a confirmed mark and updates quantity", () => {
    let pos = basePosition();
    pos = {
      ...pos,
      evidenceAnchors: [
        ...pos.evidenceAnchors,
        {
          ...pos.evidenceAnchors[0]!,
          id: "mark_second",
          bbox: { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
        },
      ],
    };
    pos = applyMarkCountAsQuantity(pos);
    expect(pos.quantity).toBe(2);
    const plan = planRemoveEvidenceAnchor(pos, "mark_second");
    expect(plan?.kind).toBe("mark");
    if (plan?.kind !== "mark") return;
    expect(manualMarkCount(plan.position)).toBe(1);
    expect(plan.position.quantity).toBe(1);
  });

  it("only occurrence requires a choice", () => {
    const pos = basePosition();
    const anchorId = pos.evidenceAnchors[0]!.id;
    const plan = planRemoveEvidenceAnchor(pos, anchorId);
    expect(plan?.kind).toBe("only_occurrence");
    const kept = removeCountedMarkKeepPosition(pos, anchorId);
    expect(manualMarkCount(kept)).toBe(0);
    expect(kept.quantity).toBe(0);
  });

  it("bulk deletes candidates only", () => {
    const a = addSimilarCandidateMarksToPosition(basePosition(), [
      {
        page: 1,
        bbox: { x: 0.5, y: 0.5, width: 0.02, height: 0.02 },
        matchScore: 0.9,
        fileName: "plan.pdf",
      },
      {
        page: 1,
        bbox: { x: 0.6, y: 0.6, width: 0.02, height: 0.02 },
        matchScore: 0.91,
        fileName: "plan.pdf",
      },
    ]);
    const ids = similarCandidateAnchors(a).map((c) => ({
      positionId: a.id,
      anchorId: c.id,
    }));
    const [next] = removeCandidateAnchorsBulk([a], ids);
    expect(similarCandidateAnchors(next!)).toHaveLength(0);
    expect(next!.quantity).toBe(1);
  });

  it("bulk deletes confirmed marks and updates quantity", () => {
    let pos = basePosition();
    pos = {
      ...pos,
      evidenceAnchors: [
        ...pos.evidenceAnchors,
        {
          ...pos.evidenceAnchors[0]!,
          id: "mark_b",
          bbox: { x: 0.3, y: 0.3, width: 0.02, height: 0.02 },
        },
        {
          ...pos.evidenceAnchors[0]!,
          id: "mark_c",
          bbox: { x: 0.35, y: 0.35, width: 0.02, height: 0.02 },
        },
      ],
    };
    pos = applyMarkCountAsQuantity(pos);
    expect(pos.quantity).toBe(3);
    const [next] = removeEvidenceAnchorsBulk(
      [pos],
      [
        { positionId: pos.id, anchorId: "mark_b" },
        { positionId: pos.id, anchorId: "mark_c" },
      ]
    );
    expect(manualMarkCount(next!)).toBe(1);
    expect(next!.quantity).toBe(1);
  });

  it("inline rename updates label only", () => {
    const pos = basePosition();
    const renamed = renamePositionLabel(pos, "Zásuvka 230V");
    expect(renamed.label).toBe("Zásuvka 230V");
    expect(renamed.positionCode).toBe(pos.positionCode);
  });

  it("candidates do not count before confirmation", () => {
    const withCand = addSimilarCandidateMarksToPosition(basePosition(), [
      {
        page: 1,
        bbox: { x: 0.55, y: 0.55, width: 0.02, height: 0.02 },
        matchScore: 0.93,
        fileName: "plan.pdf",
      },
    ]);
    expect(manualMarkCount(withCand)).toBe(1);
    expect(withCand.quantity).toBe(1);
  });

  it("filters low-score and truncates flood of similar matches", () => {
    const marks = [
      ...Array.from({ length: 20 }, (_, i) => ({
        matchScore: 0.9,
        i,
      })),
      { matchScore: 0.5, i: 99 },
    ];
    const filtered = filterSimilarCandidateMarks(marks);
    expect(filtered.accepted.length).toBe(20);
    expect(filtered.truncated).toBe(0);
    expect(filtered.rejectedLow).toBe(1);
  });

  it("low-score matches are not attached as candidates", () => {
    const next = addSimilarCandidateMarksToPosition(basePosition(), [
      {
        page: 1,
        bbox: { x: 0.7, y: 0.7, width: 0.02, height: 0.02 },
        matchScore: 0.5,
        fileName: "plan.pdf",
      },
    ]);
    expect(similarCandidateAnchors(next)).toHaveLength(0);
  });
});
