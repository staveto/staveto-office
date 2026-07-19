/**
 * Task 1/10 — canonical drawingId resolution.
 *
 * Quote flow historically keyed takeoff data on the AI-draft `fileId`.
 * Project Documents / /takeoff always keys on the Firestore document id.
 * resolveCanonicalDrawingId() must make the quote flow resolve to the SAME
 * id Project Documents uses for the same PDF, without destroying data.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreDocs = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/firebase", () => ({
  getFirestoreInstance: vi.fn(() => ({})),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const data = firestoreDocs.get(ref.path);
    return {
      exists: () => data !== undefined,
      data: () => data,
    };
  }),
  getDocs: vi.fn(async (ref: { path: string }) => {
    const prefix = `${ref.path}/`;
    const docs = [...firestoreDocs.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    return { docs };
  }),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    firestoreDocs.set(ref.path, data);
  }),
}));

vi.mock("@/services/projects/projectDocuments", () => ({
  listProjectDocuments: vi.fn(),
}));

vi.mock("@/services/takeoff/pdfTakeoffRegionService", () => ({
  listConfirmedSymbolsForDrawing: vi.fn().mockResolvedValue([]),
  listSymbolCandidatesForDrawing: vi.fn().mockResolvedValue([]),
  listTakeoffItems: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/takeoff/drawingOccurrenceService", () => ({
  listDrawingOccurrences: vi.fn().mockResolvedValue([]),
}));

import { listProjectDocuments } from "@/services/projects/projectDocuments";
import {
  listConfirmedSymbolsForDrawing,
  listSymbolCandidatesForDrawing,
  listTakeoffItems,
} from "@/services/takeoff/pdfTakeoffRegionService";
import {
  getDrawingAlias,
  resolveCanonicalDrawingId,
} from "./drawingIdentityService";

function projectDoc(id: string, fileName: string) {
  return {
    id,
    projectId: "p1",
    fileName,
    mimeType: "application/pdf",
    storagePath: `projects/p1/documents/${id}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  firestoreDocs.clear();
  vi.mocked(listConfirmedSymbolsForDrawing).mockResolvedValue([]);
  vi.mocked(listSymbolCandidatesForDrawing).mockResolvedValue([]);
  vi.mocked(listTakeoffItems).mockResolvedValue([]);
});

describe("resolveCanonicalDrawingId — quote and project must agree on one drawingId", () => {
  it("keeps fileId as canonical when it already matches a real project document id", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_abc", "elektro.pdf") as any,
    ]);

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "doc_abc",
      fileName: "elektro.pdf",
    });

    expect(result.canonicalDrawingId).toBe("doc_abc");
    expect(result.remapped).toBe(false);
    expect(result.hasLegacyDataUnderAlias).toBe(false);
  });

  it("remaps an old AI-draft fileId to the matching project document id by file name", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_new_123", "Elektro_1NP.pdf") as any,
    ]);

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_old_456",
      fileName: "Elektro_1NP.pdf",
    });

    expect(result.canonicalDrawingId).toBe("doc_new_123");
    expect(result.remapped).toBe(true);
    expect(result.aliasFileId).toBe("ai_draft_old_456");
  });

  it("resolves the SAME canonical id for quote and project flows for the same PDF", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_shared", "pdf-topolcany.pdf") as any,
    ]);

    // Project Documents flow: opens /takeoff directly with the document id.
    const projectFlowDrawingId = "doc_shared";

    // Quote flow: only knows the AI-draft fileId + file name.
    const quoteFlowResult = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "quote_ai_file_999",
      fileName: "pdf-topolcany.pdf",
    });

    expect(quoteFlowResult.canonicalDrawingId).toBe(projectFlowDrawingId);
  });

  it("surfaces a warning (hasLegacyDataUnderAlias) when old takeoff data exists under the alias fileId", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_new", "plan.pdf") as any,
    ]);
    vi.mocked(listSymbolCandidatesForDrawing).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "c1" } as any,
    ]);

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_old",
      fileName: "plan.pdf",
    });

    expect(result.remapped).toBe(true);
    expect(result.hasLegacyDataUnderAlias).toBe(true);
    expect(result.legacyDataCounts?.symbolCandidates).toBe(1);
  });

  it("records a drawingAliases doc when remapping so the UI can offer a merge", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_new", "plan.pdf") as any,
    ]);

    await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_old",
      fileName: "plan.pdf",
    });

    const alias = await getDrawingAlias("p1", "ai_draft_old");
    expect(alias?.canonicalDrawingId).toBe("doc_new");
    expect(alias?.source).toBe("quote_ai_file");
  });

  it("falls back to the original fileId (no remap) when no matching project document exists", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([]);

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_orphan",
      fileName: "unrelated.pdf",
    });

    expect(result.canonicalDrawingId).toBe("ai_draft_orphan");
    expect(result.remapped).toBe(false);
  });

  it("remaps to the project's ONLY PDF document even when the file name differs (rename-safe)", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_only_pdf", "06_Znacenie_elektrika 2.pdf") as any,
    ]);

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_renamed",
      fileName: "elektrika-final.pdf",
    });

    expect(result.canonicalDrawingId).toBe("doc_only_pdf");
    expect(result.remapped).toBe(true);
  });

  it("single-PDF fallback recognizes a PDF by file extension when mimeType is generic", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      {
        ...projectDoc("doc_octet_pdf", "plan.pdf"),
        mimeType: "application/octet-stream",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_z",
      fileName: "iny-nazov.pdf",
    });

    expect(result.canonicalDrawingId).toBe("doc_octet_pdf");
    expect(result.remapped).toBe(true);
  });

  it("resolves when the quote's legacy drawingId is a plain FILE NAME (multi-doc estimator off)", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_real", "06_Znacenie_elektrika 2.pdf") as any,
    ]);

    // Historically the quote keyed takeoff data on the bare file name.
    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "06_Znacenie_elektrika 2.pdf",
      fileName: "06_Znacenie_elektrika 2.pdf",
    });

    expect(result.canonicalDrawingId).toBe("doc_real");
    expect(result.remapped).toBe(true);
    expect(result.canonicalDocument?.fileName).toBe("06_Znacenie_elektrika 2.pdf");
  });

  it("does NOT guess between multiple PDF documents when no name matches", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_a", "prizemie.pdf") as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_b", "poschodie.pdf") as any,
    ]);

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_x",
      fileName: "nezname.pdf",
    });

    expect(result.canonicalDrawingId).toBe("ai_draft_x");
    expect(result.remapped).toBe(false);
  });

  it("reuses a previously stored alias mapping even after the document was renamed", async () => {
    vi.mocked(listProjectDocuments).mockResolvedValue([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_target", "old-name.pdf") as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projectDoc("doc_other", "another.pdf") as any,
    ]);
    firestoreDocs.set("projects/p1/drawingAliases/ai_draft_stable", {
      aliasId: "ai_draft_stable",
      canonicalDrawingId: "doc_target",
      projectId: "p1",
      source: "quote_ai_file",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_stable",
      // name no longer matches any document — alias must still win
      fileName: "renamed-since.pdf",
    });

    expect(result.canonicalDrawingId).toBe("doc_target");
    expect(result.remapped).toBe(true);
  });

  it("never throws when Firestore lookups fail — resolution degrades to the original fileId", async () => {
    vi.mocked(listProjectDocuments).mockRejectedValue(new Error("firestore down"));

    const result = await resolveCanonicalDrawingId({
      projectId: "p1",
      fileId: "ai_draft_1",
      fileName: "plan.pdf",
    });

    expect(result.canonicalDrawingId).toBe("ai_draft_1");
    expect(result.remapped).toBe(false);
  });
});
