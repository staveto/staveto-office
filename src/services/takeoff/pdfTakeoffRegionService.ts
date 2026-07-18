/**
 * Firestore persistence for PDF Takeoff Region Analyzer entities.
 *
 * Paths (under projects/{projectId}/…):
 *  - drawingRegions/{regionId}
 *  - symbolCandidates/{candidateId}
 *  - confirmedSymbols/{id}      (Phase 2)
 *  - takeoffEvidence/{id}       (Phase 2)
 *  - takeoffItems/{id}          (Phase 2)
 *
 * Covered by the existing project-subcollection catch-all rule.
 */

import {
  getFirestoreInstance,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from "@/lib/firebase";
import { sanitizeTakeoffItemForWrite } from "@/lib/takeoff/candidateReview";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import type {
  AnalyzeRegionCandidateDto,
  BBoxPdf,
  ConfirmedSymbol,
  DrawingRegion,
  DrawingRegionStatus,
  SymbolCandidate,
  SymbolCandidateStatus,
  SymbolTemplate,
  TakeoffEvidence,
  TakeoffItem,
} from "@/types/pdfTakeoff";

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createDrawingRegion(input: {
  projectId: string;
  drawingId: string;
  pageNumber: number;
  bboxPdf: BBoxPdf;
  normalizedBbox: NormalizedRect;
  profession: string;
  createdBy?: string;
  status?: DrawingRegionStatus;
}): Promise<DrawingRegion> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const now = new Date().toISOString();
  const id = newId("reg");
  const record: DrawingRegion = {
    id,
    projectId: input.projectId,
    drawingId: input.drawingId,
    pageNumber: input.pageNumber,
    bboxPdf: input.bboxPdf,
    normalizedBbox: input.normalizedBbox,
    profession: input.profession,
    status: input.status ?? "pending",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(
    doc(db, "projects", input.projectId, "drawingRegions", id),
    stripUndefined({ ...record, id: undefined })
  );
  return record;
}

export async function updateDrawingRegionStatus(
  projectId: string,
  regionId: string,
  status: DrawingRegionStatus,
  extra?: { regionImageUrl?: string | null }
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await updateDoc(doc(db, "projects", projectId, "drawingRegions", regionId), {
    status,
    ...(extra?.regionImageUrl !== undefined
      ? { regionImageUrl: extra.regionImageUrl }
      : {}),
    updatedAt: new Date().toISOString(),
  });
}

export async function saveSymbolCandidates(
  projectId: string,
  regionId: string | null,
  drawingId: string,
  pageNumber: number,
  dtos: AnalyzeRegionCandidateDto[]
): Promise<SymbolCandidate[]> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const now = new Date().toISOString();
  const created: SymbolCandidate[] = [];

  for (const dto of dtos) {
    const id = dto.id.startsWith("cand_") ? dto.id : newId("cand");
    const record: SymbolCandidate = {
      id,
      projectId,
      drawingId,
      pageNumber,
      regionId,
      bboxPdf: dto.bbox_pdf,
      bboxPx: dto.bbox_px,
      normalizedPosition: dto.normalized_position,
      colorLayer: dto.color_layer,
      kind: dto.kind,
      labelSuggestions: dto.label_suggestions,
      nearbyText: dto.nearby_text,
      confidence: dto.confidence,
      source: dto.source,
      status: dto.status,
      previewImageUrl: dto.preview_image_url,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(
      doc(db, "projects", projectId, "symbolCandidates", id),
      stripUndefined({ ...record, id: undefined })
    );
    created.push(record);
  }
  return created;
}

export async function listSymbolCandidatesForDrawing(
  projectId: string,
  drawingId: string,
  opts?: { statusNot?: SymbolCandidate["status"][] }
): Promise<SymbolCandidate[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "symbolCandidates");
  const snap = await getDocs(query(col, where("drawingId", "==", drawingId)));
  let list = snap.docs.map((d) => ({
    ...(d.data() as Omit<SymbolCandidate, "id">),
    id: d.id,
  }));
  if (opts?.statusNot?.length) {
    const ban = new Set(opts.statusNot);
    list = list.filter((c) => !ban.has(c.status));
  }
  return list.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

export async function getSymbolCandidate(
  projectId: string,
  candidateId: string
): Promise<SymbolCandidate | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  const snap = await getDoc(doc(db, "projects", projectId, "symbolCandidates", candidateId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<SymbolCandidate, "id">), id: snap.id };
}

/**
 * Permanently remove a candidate row. Callers must never call this for a
 * `status: "confirmed"` candidate directly — confirmed symbols carry a
 * takeoff quantity/evidence that a plain delete would leave dangling; use
 * the symmetric unconfirm-and-delete flow in symbolCandidateReviewService
 * instead (it deletes the candidate as its last step).
 */
export async function deleteSymbolCandidate(
  projectId: string,
  candidateId: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await deleteDoc(doc(db, "projects", projectId, "symbolCandidates", candidateId));
}

export async function updateSymbolCandidateStatus(
  projectId: string,
  candidateId: string,
  patch: Partial<
    Pick<SymbolCandidate, "status" | "labelSuggestions" | "confidence" | "kind" | "nearbyText">
  > & { symbolTypeHint?: string }
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const { symbolTypeHint, ...rest } = patch;
  await updateDoc(
    doc(db, "projects", projectId, "symbolCandidates", candidateId),
    stripUndefined({
      ...rest,
      ...(symbolTypeHint ? { metadataSymbolType: symbolTypeHint } : {}),
      updatedAt: new Date().toISOString(),
    }) as Record<string, unknown>
  );
}

/**
 * Move a not-yet-confirmed candidate (drag on the plan) — only the overlay
 * position changes; status/quantities are untouched.
 */
export async function updateSymbolCandidatePosition(
  projectId: string,
  candidateId: string,
  position: { normalizedPosition: NormalizedRect; bboxPdf: BBoxPdf }
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await updateDoc(
    doc(db, "projects", projectId, "symbolCandidates", candidateId),
    stripUndefined({ ...position, updatedAt: new Date().toISOString() }) as Record<
      string,
      unknown
    >
  );
}

/**
 * Move an already-confirmed symbol (drag on the plan) — corrects a
 * mis-placed mark without touching quantity/evidence, which stay linked by id.
 */
export async function updateConfirmedSymbolPosition(
  projectId: string,
  symbolId: string,
  position: { normalizedPosition: NormalizedRect; bboxPdf: BBoxPdf }
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await updateDoc(
    doc(db, "projects", projectId, "confirmedSymbols", symbolId),
    stripUndefined({ ...position, updatedAt: new Date().toISOString() }) as Record<
      string,
      unknown
    >
  );
}

export async function createConfirmedSymbol(
  input: Omit<ConfirmedSymbol, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<ConfirmedSymbol> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const now = new Date().toISOString();
  const id = input.id ?? newId("csym");
  const record: ConfirmedSymbol = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(
    doc(db, "projects", input.projectId, "confirmedSymbols", id),
    stripUndefined({ ...record, id: undefined })
  );
  return record;
}

export async function getConfirmedSymbol(
  projectId: string,
  symbolId: string
): Promise<ConfirmedSymbol | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  const snap = await getDoc(doc(db, "projects", projectId, "confirmedSymbols", symbolId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<ConfirmedSymbol, "id">), id: snap.id };
}

/**
 * Retype an already-confirmed symbol. Callers must re-bucket the takeoff
 * quantity BEFORE calling this — see changeConfirmedSymbolType in
 * symbolCandidateReviewService.ts, which is the safe entry point.
 */
export async function updateConfirmedSymbolType(
  projectId: string,
  symbolId: string,
  symbolType: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await updateDoc(doc(db, "projects", projectId, "confirmedSymbols", symbolId), {
    symbolType,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Permanently remove a confirmed symbol row. Callers must reverse the
 * takeoff quantity/evidence it created FIRST — see unconfirmAndDeleteSymbol
 * in symbolCandidateReviewService.ts, which is the safe entry point.
 */
export async function deleteConfirmedSymbol(
  projectId: string,
  symbolId: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await deleteDoc(doc(db, "projects", projectId, "confirmedSymbols", symbolId));
}

export async function listConfirmedSymbolsForDrawing(
  projectId: string,
  drawingId: string
): Promise<ConfirmedSymbol[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "confirmedSymbols");
  const snap = await getDocs(query(col, where("drawingId", "==", drawingId)));
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<ConfirmedSymbol, "id">),
    id: d.id,
  }));
}

/** Reverse-lookup of the confirmed symbol created FROM a given candidate row. */
export async function getConfirmedSymbolByCandidateId(
  projectId: string,
  candidateId: string
): Promise<ConfirmedSymbol | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  const col = collection(db, "projects", projectId, "confirmedSymbols");
  const snap = await getDocs(query(col, where("candidateId", "==", candidateId)));
  const first = snap.docs[0];
  if (!first) return null;
  return { ...(first.data() as Omit<ConfirmedSymbol, "id">), id: first.id };
}

export async function listConfirmedSymbolsForPage(
  projectId: string,
  drawingId: string,
  pageNumber: number
): Promise<ConfirmedSymbol[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "confirmedSymbols");
  const snap = await getDocs(
    query(col, where("drawingId", "==", drawingId), where("pageNumber", "==", pageNumber))
  );
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<ConfirmedSymbol, "id">),
    id: d.id,
  }));
}

export async function listTakeoffItems(
  projectId: string,
  drawingId?: string
): Promise<TakeoffItem[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "takeoffItems");
  const snap = await getDocs(
    drawingId ? query(col, where("drawingId", "==", drawingId)) : col
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<TakeoffItem, "id">), id: d.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteTakeoffItem(projectId: string, itemId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await deleteDoc(doc(db, "projects", projectId, "takeoffItems", itemId));
}

export async function upsertTakeoffItem(item: TakeoffItem): Promise<TakeoffItem> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  // Invariants: sourceOfQuantity required; legend_only never stored as confirmed.
  const safe = sanitizeTakeoffItemForWrite(item);
  await setDoc(
    doc(db, "projects", safe.projectId, "takeoffItems", safe.id),
    stripUndefined({ ...safe, id: undefined })
  );
  return safe;
}

export async function createTakeoffEvidence(
  input: Omit<TakeoffEvidence, "id" | "createdAt"> & { id?: string }
): Promise<TakeoffEvidence> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const id = input.id ?? newId("tev");
  const record: TakeoffEvidence = {
    ...input,
    id,
    createdAt: new Date().toISOString(),
  };
  await setDoc(
    doc(db, "projects", input.projectId, "takeoffEvidence", id),
    stripUndefined({ ...record, id: undefined })
  );
  return record;
}

export async function listTakeoffEvidenceForItem(
  projectId: string,
  takeoffItemId: string
): Promise<TakeoffEvidence[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "takeoffEvidence");
  const snap = await getDocs(query(col, where("takeoffItemId", "==", takeoffItemId)));
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<TakeoffEvidence, "id">),
    id: d.id,
  }));
}

export async function deleteTakeoffEvidence(
  projectId: string,
  evidenceId: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await deleteDoc(doc(db, "projects", projectId, "takeoffEvidence", evidenceId));
}

/** Evidence rows created by a specific confirmed symbol (duplicate-conflict lookup). */
export async function listTakeoffEvidenceForConfirmedSymbol(
  projectId: string,
  confirmedSymbolId: string
): Promise<TakeoffEvidence[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "takeoffEvidence");
  const snap = await getDocs(query(col, where("confirmedSymbolId", "==", confirmedSymbolId)));
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<TakeoffEvidence, "id">),
    id: d.id,
  }));
}

/** Project's symbol template library — used by Analyze Region v2 (template matching). */
export async function listSymbolTemplatesForProject(
  projectId: string,
  profession?: string
): Promise<SymbolTemplate[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const col = collection(db, "projects", projectId, "symbolTemplates");
  const snap = await getDocs(profession ? query(col, where("profession", "==", profession)) : col);
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<SymbolTemplate, "id">),
    id: d.id,
  }));
}

export async function createSymbolTemplate(
  input: Omit<SymbolTemplate, "id" | "createdAt" | "updatedAt" | "usageCount"> & {
    id?: string;
    usageCount?: number;
  }
): Promise<SymbolTemplate> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const now = new Date().toISOString();
  const id = input.id ?? newId("tmpl");
  const record: SymbolTemplate = {
    ...input,
    id,
    usageCount: input.usageCount ?? 1,
    createdAt: now,
    updatedAt: now,
  };
  const pathProjectId = input.projectId;
  if (!pathProjectId) throw new Error("projectId required for template");
  await setDoc(
    doc(db, "projects", pathProjectId, "symbolTemplates", id),
    stripUndefined({ ...record, id: undefined })
  );
  return record;
}

export type { SymbolCandidateStatus };
