/**
 * Drawing annotations — designer notes on a plan (text, sticky notes, shapes).
 *
 * Pure presentation layer on top of the PDF: annotations NEVER touch takeoff
 * quantities, candidates or quote items. Stored per project under
 * projects/{projectId}/drawingAnnotations (covered by the project
 * subcollection catch-all Firestore rule) and keyed by the canonical
 * drawingId, so quote and Documents views see the same notes.
 */

import {
  getFirestoreInstance,
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from "@/lib/firebase";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type { DrawingAnnotation, DrawingAnnotationKind } from "@/types/pdfTakeoff";

function newId(): string {
  return `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function requireDb() {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  return db;
}

export async function createDrawingAnnotation(input: {
  projectId: string;
  drawingId: string;
  pageNumber: number;
  kind: DrawingAnnotationKind;
  normalizedPosition: NormalizedRect;
  text?: string;
  color?: string;
  createdBy?: string;
}): Promise<DrawingAnnotation> {
  const db = requireDb();
  const now = new Date().toISOString();
  const annotation: DrawingAnnotation = {
    id: newId(),
    projectId: input.projectId,
    drawingId: input.drawingId,
    pageNumber: input.pageNumber,
    kind: input.kind,
    normalizedPosition: input.normalizedPosition,
    text: input.text?.trim() ?? "",
    color: input.color ?? DEFAULT_ANNOTATION_COLOR,
    createdAt: now,
    updatedAt: now,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
  };
  await setDoc(
    doc(db, "projects", input.projectId, "drawingAnnotations", annotation.id),
    annotation
  );
  return annotation;
}

export async function updateDrawingAnnotation(
  projectId: string,
  annotationId: string,
  patch: Partial<Pick<DrawingAnnotation, "text" | "color" | "normalizedPosition">>
): Promise<void> {
  const db = requireDb();
  await updateDoc(doc(db, "projects", projectId, "drawingAnnotations", annotationId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteDrawingAnnotation(
  projectId: string,
  annotationId: string
): Promise<void> {
  const db = requireDb();
  await deleteDoc(doc(db, "projects", projectId, "drawingAnnotations", annotationId));
}

/** Live subscription to one drawing's annotations. Returns unsubscribe. */
export function watchDrawingAnnotations(
  projectId: string,
  drawingId: string,
  onChange: (annotations: DrawingAnnotation[]) => void
): () => void {
  const db = requireDb();
  const col = collection(db, "projects", projectId, "drawingAnnotations");
  const q = query(col, where("drawingId", "==", drawingId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as DrawingAnnotation);
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onChange(list);
    },
    () => onChange([])
  );
}

/** Default ink for new annotations — red reads as "review note" on plans. */
export const DEFAULT_ANNOTATION_COLOR = "#DC2626";
