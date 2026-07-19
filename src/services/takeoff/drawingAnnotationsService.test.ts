/**
 * Drawing annotations — designer notes on a plan.
 *
 * Annotations are pure presentation: they must persist under the project,
 * be keyed by drawingId, and never touch takeoff collections.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreDocs = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/firebase", () => ({
  getFirestoreInstance: vi.fn(() => ({})),
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    firestoreDocs.set(ref.path, data);
  }),
  updateDoc: vi.fn(async (ref: { path: string }, patch: Record<string, unknown>) => {
    const existing = firestoreDocs.get(ref.path);
    if (!existing) throw new Error("not found");
    firestoreDocs.set(ref.path, { ...existing, ...patch });
  }),
  deleteDoc: vi.fn(async (ref: { path: string }) => {
    firestoreDocs.delete(ref.path);
  }),
  query: vi.fn((col: { path: string }, ...clauses: unknown[]) => ({ col, clauses })),
  where: vi.fn((field: string, _op: string, value: unknown) => ({ field, value })),
  onSnapshot: vi.fn(),
}));

import {
  createDrawingAnnotation,
  deleteDrawingAnnotation,
  updateDrawingAnnotation,
  DEFAULT_ANNOTATION_COLOR,
} from "./drawingAnnotationsService";

beforeEach(() => {
  firestoreDocs.clear();
});

describe("createDrawingAnnotation", () => {
  it("stores the annotation under projects/{id}/drawingAnnotations with defaults", async () => {
    const ann = await createDrawingAnnotation({
      projectId: "p1",
      drawingId: "docA",
      pageNumber: 2,
      kind: "note",
      normalizedPosition: { x: 0.1, y: 0.2, width: 0.02, height: 0.02 },
      text: "  skontrolovať výšku zásuvky  ",
    });

    expect(ann.id).toMatch(/^ann_/);
    expect(ann.text).toBe("skontrolovať výšku zásuvky");
    expect(ann.color).toBe(DEFAULT_ANNOTATION_COLOR);
    expect(ann.pageNumber).toBe(2);

    const stored = firestoreDocs.get(`projects/p1/drawingAnnotations/${ann.id}`);
    expect(stored).toBeDefined();
    expect(stored).toMatchObject({
      drawingId: "docA",
      kind: "note",
      projectId: "p1",
    });
  });

  it("keeps shapes with empty text valid", async () => {
    const ann = await createDrawingAnnotation({
      projectId: "p1",
      drawingId: "docA",
      pageNumber: 1,
      kind: "rect",
      normalizedPosition: { x: 0.3, y: 0.3, width: 0.1, height: 0.05 },
    });
    expect(ann.text).toBe("");
    expect(ann.kind).toBe("rect");
  });
});

describe("updateDrawingAnnotation", () => {
  it("patches text and bumps updatedAt", async () => {
    const ann = await createDrawingAnnotation({
      projectId: "p1",
      drawingId: "docA",
      pageNumber: 1,
      kind: "text",
      normalizedPosition: { x: 0, y: 0, width: 0.01, height: 0.02 },
      text: "old",
    });
    await updateDrawingAnnotation("p1", ann.id, { text: "new text" });
    const stored = firestoreDocs.get(`projects/p1/drawingAnnotations/${ann.id}`) as {
      text: string;
      updatedAt: string;
    };
    expect(stored.text).toBe("new text");
    expect(stored.updatedAt >= ann.updatedAt).toBe(true);
  });
});

describe("deleteDrawingAnnotation", () => {
  it("removes the stored annotation", async () => {
    const ann = await createDrawingAnnotation({
      projectId: "p1",
      drawingId: "docA",
      pageNumber: 1,
      kind: "ellipse",
      normalizedPosition: { x: 0.5, y: 0.5, width: 0.08, height: 0.06 },
    });
    await deleteDrawingAnnotation("p1", ann.id);
    expect(firestoreDocs.has(`projects/p1/drawingAnnotations/${ann.id}`)).toBe(false);
  });
});
