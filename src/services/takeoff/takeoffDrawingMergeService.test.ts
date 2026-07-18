/**
 * Task 2/10 — safe, non-destructive merge helper (dry-run + actual mode).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConfirmedSymbol,
  SymbolCandidate,
  TakeoffEvidence,
  TakeoffItem,
} from "@/types/pdfTakeoff";

const firestoreDocs = new Map<string, Record<string, unknown>>();

function pathOf(segments: string[]): string {
  return segments.join("/");
}

vi.mock("@/lib/firebase", () => ({
  getFirestoreInstance: vi.fn(() => ({})),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    __kind: "collection",
    path: pathOf(segments),
  })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    __kind: "doc",
    path: pathOf(segments),
  })),
  getDocs: vi.fn(async (ref: { path: string }) => {
    const prefix = `${ref.path}/`;
    const docs = [...firestoreDocs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    return { docs };
  }),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    firestoreDocs.set(ref.path, data);
  }),
  updateDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    const existing = firestoreDocs.get(ref.path) ?? {};
    firestoreDocs.set(ref.path, { ...existing, ...data });
  }),
}));

vi.mock("@/services/takeoff/pdfTakeoffRegionService", () => ({
  listConfirmedSymbolsForDrawing: vi.fn(),
  listSymbolCandidatesForDrawing: vi.fn(),
  listSymbolTemplatesForProject: vi.fn().mockResolvedValue([]),
  listTakeoffEvidenceForConfirmedSymbol: vi.fn().mockResolvedValue([]),
  listTakeoffItems: vi.fn(),
}));

import {
  listConfirmedSymbolsForDrawing,
  listSymbolCandidatesForDrawing,
  listTakeoffEvidenceForConfirmedSymbol,
  listTakeoffItems,
} from "@/services/takeoff/pdfTakeoffRegionService";
import { mergeTakeoffDrawingData } from "./takeoffDrawingMergeService";

const RECT_A = { x: 0.4, y: 0.4, width: 0.03, height: 0.03 };
const RECT_FAR = { x: 0.9, y: 0.9, width: 0.02, height: 0.02 };

function candidate(overrides: Partial<SymbolCandidate>): SymbolCandidate {
  return {
    id: "cand_1",
    drawingId: "from_id",
    projectId: "p1",
    pageNumber: 1,
    regionId: null,
    bboxPdf: [0, 0, 10, 10],
    bboxPx: [0, 0, 20, 20],
    normalizedPosition: RECT_A,
    colorLayer: "green",
    kind: "symbol_candidate",
    labelSuggestions: [{ label: "zásuvka", confidence: 0.7 }],
    nearbyText: null,
    confidence: 0.7,
    source: "opencv",
    status: "candidate",
    previewImageUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function confirmedSymbol(overrides: Partial<ConfirmedSymbol>): ConfirmedSymbol {
  return {
    id: "csym_1",
    candidateId: null,
    drawingId: "from_id",
    projectId: "p1",
    pageNumber: 1,
    bboxPdf: [0, 0, 10, 10],
    normalizedPosition: RECT_A,
    symbolType: "zásuvka",
    profession: "electrical",
    roomId: null,
    zoneId: null,
    quantityValue: 1,
    quantityUnit: "ks",
    confirmationSource: "manual",
    confidence: 1,
    evidenceImageUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function takeoffItem(overrides: Partial<TakeoffItem>): TakeoffItem {
  return {
    id: "item_1",
    projectId: "p1",
    drawingId: "from_id",
    quoteId: null,
    name: "Zásuvka 230V",
    profession: "electrical",
    quantity: 3,
    unit: "ks",
    sourceOfQuantity: "manual",
    status: "draft",
    evidenceCount: 0,
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  firestoreDocs.clear();
  vi.mocked(listConfirmedSymbolsForDrawing).mockResolvedValue([]);
  vi.mocked(listSymbolCandidatesForDrawing).mockResolvedValue([]);
  vi.mocked(listTakeoffItems).mockResolvedValue([]);
  vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockResolvedValue([]);
});

describe("mergeTakeoffDrawingData — dry run", () => {
  it("reports counts per collection without writing anything", async () => {
    vi.mocked(listSymbolCandidatesForDrawing).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [candidate({ id: "cand_1" }), candidate({ id: "cand_2", normalizedPosition: RECT_FAR })] : []
    );
    vi.mocked(listConfirmedSymbolsForDrawing).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [confirmedSymbol({ id: "csym_1" })] : []
    );
    vi.mocked(listTakeoffItems).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [takeoffItem({ id: "item_1" })] : []
    );

    const result = await mergeTakeoffDrawingData({
      projectId: "p1",
      fromDrawingId: "from_id",
      toDrawingId: "to_id",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.collections.symbolCandidates.totalInSource).toBe(2);
    expect(result.collections.symbolCandidates.wouldCopy).toBe(2);
    expect(result.collections.symbolCandidates.copied).toBe(0);
    expect(result.collections.confirmedSymbols.totalInSource).toBe(1);
    expect(result.collections.confirmedSymbols.wouldCopy).toBe(1);
    expect(result.collections.takeoffItems.totalInSource).toBe(1);
    expect(result.collections.takeoffItems.wouldCopy).toBe(1);
    // Nothing written to Firestore during a dry run.
    expect(firestoreDocs.size).toBe(0);
    expect(result.backupLogId).toBeUndefined();
  });

  it("flags duplicate-bbox conflicts instead of proposing a copy", async () => {
    vi.mocked(listSymbolCandidatesForDrawing).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [candidate({ id: "cand_1" })] : [candidate({ id: "cand_target_1", drawingId: "to_id" })]
    );

    const result = await mergeTakeoffDrawingData({
      projectId: "p1",
      fromDrawingId: "from_id",
      toDrawingId: "to_id",
      dryRun: true,
    });

    expect(result.collections.symbolCandidates.duplicateRisks).toBe(1);
    expect(result.collections.symbolCandidates.wouldCopy).toBe(0);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({ collection: "symbolCandidates", sourceId: "cand_1", reason: "duplicate_bbox" })
    );
  });

  it("returns an all-empty report when fromDrawingId equals toDrawingId (no-op)", async () => {
    const result = await mergeTakeoffDrawingData({
      projectId: "p1",
      fromDrawingId: "same_id",
      toDrawingId: "same_id",
      dryRun: true,
    });

    expect(result.collections.symbolCandidates.totalInSource).toBe(0);
    expect(listSymbolCandidatesForDrawing).not.toHaveBeenCalled();
  });
});

describe("mergeTakeoffDrawingData — actual mode", () => {
  it("copies non-duplicate candidates/confirmed/items to the target and marks originals as migrated", async () => {
    vi.mocked(listSymbolCandidatesForDrawing).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [candidate({ id: "cand_1" })] : []
    );
    vi.mocked(listConfirmedSymbolsForDrawing).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [confirmedSymbol({ id: "csym_1", quantityValue: 4 })] : []
    );
    vi.mocked(listTakeoffItems).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [takeoffItem({ id: "item_1", quantity: 5 })] : []
    );

    const result = await mergeTakeoffDrawingData({
      projectId: "p1",
      fromDrawingId: "from_id",
      toDrawingId: "to_id",
      dryRun: false,
    });

    expect(result.collections.symbolCandidates.copied).toBe(1);
    expect(result.collections.confirmedSymbols.copied).toBe(1);
    expect(result.collections.takeoffItems.copied).toBe(1);
    expect(result.backupLogId).toBeTruthy();

    // Original docs marked, not deleted.
    expect(firestoreDocs.get("projects/p1/symbolCandidates/cand_1")).toMatchObject({
      migratedToDrawingId: "to_id",
    });
    expect(firestoreDocs.get("projects/p1/confirmedSymbols/csym_1")).toMatchObject({
      migratedToDrawingId: "to_id",
    });

    // Copies carry the SAME quantity — this helper never recomputes quantities.
    const copiedConfirmed = [...firestoreDocs.entries()].find(
      ([path, data]) => path.startsWith("projects/p1/confirmedSymbols/") && data.drawingId === "to_id"
    );
    expect(copiedConfirmed?.[1]).toMatchObject({ quantityValue: 4 });

    const copiedItem = [...firestoreDocs.entries()].find(
      ([path, data]) => path.startsWith("projects/p1/takeoffItems/") && data.drawingId === "to_id"
    );
    expect(copiedItem?.[1]).toMatchObject({ quantity: 5 });

    // A backup log doc records what happened.
    expect(firestoreDocs.get(`projects/p1/takeoffMergeLogs/${result.backupLogId}`)).toMatchObject({
      fromDrawingId: "from_id",
      toDrawingId: "to_id",
    });
  });

  it("never copies a duplicate confirmed symbol and never changes the target's existing quantity", async () => {
    const targetSymbol = confirmedSymbol({ id: "csym_target", drawingId: "to_id", quantityValue: 9 });
    vi.mocked(listConfirmedSymbolsForDrawing).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [confirmedSymbol({ id: "csym_1", quantityValue: 4 })] : [targetSymbol]
    );

    await mergeTakeoffDrawingData({
      projectId: "p1",
      fromDrawingId: "from_id",
      toDrawingId: "to_id",
      dryRun: false,
    });

    // The pre-existing target symbol was never written to (never touched).
    expect(firestoreDocs.has("projects/p1/confirmedSymbols/csym_target")).toBe(false);
    // No new confirmedSymbol doc created for the duplicate.
    const createdConfirmed = [...firestoreDocs.entries()].filter(([path, data]) =>
      path.startsWith("projects/p1/confirmedSymbols/") && data.drawingId === "to_id"
    );
    expect(createdConfirmed).toHaveLength(0);
  });

  it("copies evidence and remaps confirmedSymbolId to the newly-copied confirmed symbol", async () => {
    vi.mocked(listConfirmedSymbolsForDrawing).mockImplementation(async (_p, drawingId) =>
      drawingId === "from_id" ? [confirmedSymbol({ id: "csym_1" })] : []
    );
    const sourceEvidence: TakeoffEvidence = {
      id: "ev_1",
      takeoffItemId: "item_1",
      confirmedSymbolId: "csym_1",
      drawingId: "from_id",
      projectId: "p1",
      pageNumber: 1,
      bboxPdf: [0, 0, 10, 10],
      evidenceImageUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    vi.mocked(listTakeoffEvidenceForConfirmedSymbol).mockImplementation(async (_p, confirmedSymbolId) =>
      confirmedSymbolId === "csym_1" ? [sourceEvidence] : []
    );

    const result = await mergeTakeoffDrawingData({
      projectId: "p1",
      fromDrawingId: "from_id",
      toDrawingId: "to_id",
      dryRun: false,
    });

    expect(result.collections.takeoffEvidence.copied).toBe(1);
    const copiedEvidence = [...firestoreDocs.entries()].find(
      ([path, data]) => path.startsWith("projects/p1/takeoffEvidence/") && data.drawingId === "to_id"
    );
    expect(copiedEvidence).toBeTruthy();
    const [, evidenceData] = copiedEvidence!;
    expect(evidenceData.confirmedSymbolId).not.toBe("csym_1"); // remapped to the copy's new id
  });
});
