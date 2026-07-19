/**
 * Firestore persistence for the PDF measure tool — scale calibrations,
 * simple length measurements and cable runs.
 *
 * Paths (under projects/{projectId}/…, covered by the existing project
 * subcollection catch-all rule — same as drawingAnnotations):
 *  - drawingScaleCalibrations/{id}   one per (drawingId, pageNumber)
 *  - drawingMeasurements/{id}        simple two-point lengths
 *  - cableRuns/{id}                  polyline cable routes
 *
 * Keyed by the canonical drawingId, so the quote view and the Documents
 * view of the same PDF share calibrations and measurements.
 */

import {
  getFirestoreInstance,
  collection,
  deleteDoc,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
} from "@/lib/firebase";
import type {
  CableRun,
  DrawingMeasurement,
  DrawingScaleCalibration,
} from "@/types/pdfTakeoff";

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function requireDb() {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  return db;
}

/** Firestore rejects undefined values — drop optional keys before writing. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deterministic calibration doc id — one calibration per drawing page.
 * The drawingId may contain slashes (storage paths); flatten them.
 */
function calibrationDocId(drawingId: string, pageNumber: number): string {
  return `cal_${drawingId.replace(/[^a-zA-Z0-9_-]/g, "-")}_p${pageNumber}`;
}

// ---- Scale calibration ------------------------------------------------------

export async function upsertScaleCalibration(
  projectId: string,
  input: Omit<DrawingScaleCalibration, "id" | "createdAt" | "updatedAt"> & {
    createdAt?: string;
  }
): Promise<DrawingScaleCalibration> {
  const db = requireDb();
  const now = new Date().toISOString();
  const calibration: DrawingScaleCalibration = {
    ...input,
    id: calibrationDocId(input.drawingId, input.pageNumber),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  await setDoc(
    doc(db, "projects", projectId, "drawingScaleCalibrations", calibration.id),
    stripUndefined(calibration)
  );
  return calibration;
}

export async function deleteScaleCalibration(
  projectId: string,
  drawingId: string,
  pageNumber: number
): Promise<void> {
  const db = requireDb();
  await deleteDoc(
    doc(
      db,
      "projects",
      projectId,
      "drawingScaleCalibrations",
      calibrationDocId(drawingId, pageNumber)
    )
  );
}

/**
 * Live subscription to ALL calibrations of one drawing (all pages) — the
 * viewer picks the current page's calibration locally so page flips don't
 * re-subscribe. Returns unsubscribe.
 */
export function watchScaleCalibrations(
  projectId: string,
  drawingId: string,
  onChange: (calibrations: DrawingScaleCalibration[]) => void
): () => void {
  const db = requireDb();
  const col = collection(db, "projects", projectId, "drawingScaleCalibrations");
  return onSnapshot(
    query(col, where("drawingId", "==", drawingId)),
    (snap) => {
      onChange(snap.docs.map((d) => d.data() as DrawingScaleCalibration));
    },
    () => onChange([])
  );
}

// ---- Simple length measurements ---------------------------------------------

export async function upsertDrawingMeasurement(
  projectId: string,
  input: Omit<DrawingMeasurement, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  }
): Promise<DrawingMeasurement> {
  const db = requireDb();
  const now = new Date().toISOString();
  const measurement: DrawingMeasurement = {
    ...input,
    id: input.id ?? newId("meas"),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  await setDoc(
    doc(db, "projects", projectId, "drawingMeasurements", measurement.id),
    stripUndefined(measurement)
  );
  return measurement;
}

export async function deleteDrawingMeasurement(
  projectId: string,
  measurementId: string
): Promise<void> {
  const db = requireDb();
  await deleteDoc(doc(db, "projects", projectId, "drawingMeasurements", measurementId));
}

/** Live subscription to one drawing's simple measurements. Returns unsubscribe. */
export function watchDrawingMeasurements(
  projectId: string,
  drawingId: string,
  onChange: (measurements: DrawingMeasurement[]) => void
): () => void {
  const db = requireDb();
  const col = collection(db, "projects", projectId, "drawingMeasurements");
  return onSnapshot(
    query(col, where("drawingId", "==", drawingId)),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as DrawingMeasurement);
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onChange(list);
    },
    () => onChange([])
  );
}

// ---- Cable runs ---------------------------------------------------------------

export async function upsertCableRun(
  projectId: string,
  input: Omit<CableRun, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  }
): Promise<CableRun> {
  const db = requireDb();
  const now = new Date().toISOString();
  const run: CableRun = {
    ...input,
    id: input.id ?? newId("crun"),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  await setDoc(
    doc(db, "projects", projectId, "cableRuns", run.id),
    stripUndefined(run)
  );
  return run;
}

export async function deleteCableRun(
  projectId: string,
  cableRunId: string
): Promise<void> {
  const db = requireDb();
  await deleteDoc(doc(db, "projects", projectId, "cableRuns", cableRunId));
}

/** Live subscription to one drawing's cable runs. Returns unsubscribe. */
export function watchCableRuns(
  projectId: string,
  drawingId: string,
  onChange: (runs: CableRun[]) => void
): () => void {
  const db = requireDb();
  const col = collection(db, "projects", projectId, "cableRuns");
  return onSnapshot(
    query(col, where("drawingId", "==", drawingId)),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as CableRun);
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      onChange(list);
    },
    () => onChange([])
  );
}
