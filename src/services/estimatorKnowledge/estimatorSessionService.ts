/**
 * Estimator session outputs — structured snapshots in estimatorSessions/{sessionId}.
 * Additive: does not replace workspaces/{id}/aiEstimatorSessions used by functions.
 * AI output is sanitized (undefined stripped) before every Firestore write.
 */

import {
  doc,
  getDoc,
  getFirestoreInstance,
  serverTimestamp,
  setDoc,
} from "@/lib/firebase";
import type { EstimatorSessionRecord } from "@/types/estimatorKnowledge";
import type {
  EstimatorDocument,
  EstimatorEvidenceAnchor,
  EstimatorPosition,
  EstimatorQuantityConflict,
  PdfOverlayAnnotation,
} from "@/types/estimatorPositions";

/** Strip undefined / functions / symbols so Firestore accepts AI output. */
export function sanitizeForFirestoreWrite<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

export type EstimatorTakeoffSnapshot = {
  positions: EstimatorPosition[];
  pdfOverlayAnnotations: PdfOverlayAnnotation[];
  documents?: EstimatorDocument[];
  conflicts?: EstimatorQuantityConflict[];
  evidenceAnchors?: EstimatorEvidenceAnchor[];
};

export async function saveEstimatorSessionSnapshot(
  record: Omit<EstimatorSessionRecord, "createdAt" | "updatedAt">
): Promise<boolean> {
  const fs = getFirestoreInstance();
  if (!fs || !record.id || !record.orgId) return false;
  try {
    await setDoc(
      doc(fs, "estimatorSessions", record.id),
      {
        ...sanitizeForFirestoreWrite(record),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}

/** Persist evidence-linked positions + PDF overlay annotations (merge, additive). */
export async function saveEstimatorPositionsSnapshot(input: {
  sessionId: string;
  orgId: string;
  projectId?: string;
  positions: EstimatorPosition[];
  pdfOverlayAnnotations: PdfOverlayAnnotation[];
  documents?: EstimatorDocument[];
  conflicts?: EstimatorQuantityConflict[];
  evidenceAnchors?: EstimatorEvidenceAnchor[];
}): Promise<boolean> {
  const fs = getFirestoreInstance();
  if (!fs || !input.sessionId || !input.orgId) return false;
  try {
    const payload: Record<string, unknown> = {
      id: input.sessionId,
      orgId: input.orgId,
      projectId: input.projectId,
      positions: input.positions,
      pdfOverlayAnnotations: input.pdfOverlayAnnotations,
    };
    if (input.documents?.length) payload.documents = input.documents;
    if (input.conflicts?.length) payload.conflicts = input.conflicts;
    if (input.evidenceAnchors?.length) payload.evidenceAnchors = input.evidenceAnchors;

    await setDoc(
      doc(fs, "estimatorSessions", input.sessionId),
      sanitizeForFirestoreWrite(payload),
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadEstimatorPositionsSnapshot(
  sessionId: string
): Promise<EstimatorTakeoffSnapshot | null> {
  const fs = getFirestoreInstance();
  if (!fs || !sessionId.trim()) return null;
  try {
    const snap = await getDoc(doc(fs, "estimatorSessions", sessionId.trim()));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<EstimatorSessionRecord>;
    if (!Array.isArray(data.positions) || data.positions.length === 0) return null;
    return {
      positions: data.positions,
      pdfOverlayAnnotations: data.pdfOverlayAnnotations ?? [],
      documents: data.documents,
      conflicts: data.conflicts,
      evidenceAnchors: data.evidenceAnchors,
    };
  } catch {
    return null;
  }
}
