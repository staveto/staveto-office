/**
 * Safe, non-destructive merge helper for takeoff data stuck under an old
 * drawingId (e.g. a quote's AI-draft fileId) when the same PDF also has a
 * canonical drawingId (a real projects/{projectId}/documents/{id}).
 *
 * Rules (see business-architecture invariants / takeoff usability task):
 *  - dryRun (default) NEVER writes anything — counts + risk report only.
 *  - Actual mode COPIES missing docs to `toDrawingId`; it never deletes or
 *    mutates quantities on existing docs. Copied SOURCE docs get a
 *    `migratedToDrawingId` marker so a re-run doesn't propose them again.
 *  - Candidates/confirmed symbols are deduped by bbox overlap + color/type
 *    before copying — a duplicate is never created at the target.
 *  - takeoffItems are deduped by name+profession+unit — quantities on
 *    existing target items are never changed by this helper.
 *  - symbolTemplates are project-scoped (not drawingId-scoped) — nothing to
 *    migrate; reported for completeness only.
 *  - Every actual-mode run writes one backup log doc under
 *    projects/{projectId}/takeoffMergeLogs/{id} recording what happened.
 */

import {
  getFirestoreInstance,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "@/lib/firebase";
import { normalizedRectOverlapRatio } from "@/lib/takeoff/candidateReview";
import type {
  ConfirmedSymbol,
  DrawingRegion,
  SymbolCandidate,
  TakeoffEvidence,
  TakeoffItem,
} from "@/types/pdfTakeoff";
import {
  listConfirmedSymbolsForDrawing,
  listSymbolCandidatesForDrawing,
  listSymbolTemplatesForProject,
  listTakeoffEvidenceForConfirmedSymbol,
  listTakeoffItems,
} from "@/services/takeoff/pdfTakeoffRegionService";

const CANDIDATE_DEDUPE_IOU = 0.35;
const CONFIRMED_DEDUPE_IOU = 0.5;
const REGION_DEDUPE_IOU = 0.5;

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type MergeCollectionReport = {
  totalInSource: number;
  duplicateRisks: number;
  wouldCopy: number;
  copied: number;
  note?: string;
};

export type MergeConflict = {
  collection: string;
  sourceId: string;
  reason: "duplicate_bbox" | "duplicate_name" | "existing_document_missing";
  matchedTargetId?: string;
};

export type MergeTakeoffDrawingDataResult = {
  projectId: string;
  fromDrawingId: string;
  toDrawingId: string;
  dryRun: boolean;
  collections: {
    drawingRegions: MergeCollectionReport;
    symbolCandidates: MergeCollectionReport;
    confirmedSymbols: MergeCollectionReport;
    takeoffItems: MergeCollectionReport;
    takeoffEvidence: MergeCollectionReport;
    symbolTemplates: MergeCollectionReport;
  };
  conflicts: MergeConflict[];
  backupLogId?: string;
};

export type MergeTakeoffDrawingDataParams = {
  projectId: string;
  fromDrawingId: string;
  toDrawingId: string;
  /** Defaults to true — callers must opt in explicitly to write anything. */
  dryRun?: boolean;
};

async function listDrawingRegionsForDrawing(
  projectId: string,
  drawingId: string
): Promise<DrawingRegion[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const snap = await getDocs(collection(db, "projects", projectId, "drawingRegions"));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<DrawingRegion, "id">), id: d.id }))
    .filter((r) => r.drawingId === drawingId);
}

export async function mergeTakeoffDrawingData(
  params: MergeTakeoffDrawingDataParams
): Promise<MergeTakeoffDrawingDataResult> {
  const { projectId, fromDrawingId, toDrawingId } = params;
  const dryRun = params.dryRun ?? true;

  if (fromDrawingId === toDrawingId) {
    const empty: MergeCollectionReport = { totalInSource: 0, duplicateRisks: 0, wouldCopy: 0, copied: 0 };
    return {
      projectId,
      fromDrawingId,
      toDrawingId,
      dryRun,
      collections: {
        drawingRegions: empty,
        symbolCandidates: empty,
        confirmedSymbols: empty,
        takeoffItems: empty,
        takeoffEvidence: empty,
        symbolTemplates: empty,
      },
      conflicts: [],
    };
  }

  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const conflicts: MergeConflict[] = [];

  // ---- drawingRegions --------------------------------------------------
  const [sourceRegions, targetRegions] = await Promise.all([
    listDrawingRegionsForDrawing(projectId, fromDrawingId),
    listDrawingRegionsForDrawing(projectId, toDrawingId),
  ]);
  let regionsDuplicate = 0;
  const regionsToCopy: DrawingRegion[] = [];
  for (const r of sourceRegions) {
    const dup = targetRegions.find(
      (t) =>
        t.pageNumber === r.pageNumber &&
        normalizedRectOverlapRatio(t.normalizedBbox, r.normalizedBbox) >= REGION_DEDUPE_IOU
    );
    if (dup) {
      regionsDuplicate++;
      conflicts.push({
        collection: "drawingRegions",
        sourceId: r.id,
        reason: "duplicate_bbox",
        matchedTargetId: dup.id,
      });
    } else {
      regionsToCopy.push(r);
    }
  }

  // ---- symbolCandidates --------------------------------------------------
  const [sourceCandidates, targetCandidates] = await Promise.all([
    listSymbolCandidatesForDrawing(projectId, fromDrawingId),
    listSymbolCandidatesForDrawing(projectId, toDrawingId),
  ]);
  let candidatesDuplicate = 0;
  const candidatesToCopy: SymbolCandidate[] = [];
  for (const c of sourceCandidates) {
    const dup = targetCandidates.find(
      (t) =>
        t.colorLayer === c.colorLayer &&
        t.pageNumber === c.pageNumber &&
        normalizedRectOverlapRatio(t.normalizedPosition, c.normalizedPosition) >= CANDIDATE_DEDUPE_IOU
    );
    if (dup) {
      candidatesDuplicate++;
      conflicts.push({
        collection: "symbolCandidates",
        sourceId: c.id,
        reason: "duplicate_bbox",
        matchedTargetId: dup.id,
      });
    } else {
      candidatesToCopy.push(c);
    }
  }

  // ---- confirmedSymbols --------------------------------------------------
  const [sourceConfirmed, targetConfirmed] = await Promise.all([
    listConfirmedSymbolsForDrawing(projectId, fromDrawingId),
    listConfirmedSymbolsForDrawing(projectId, toDrawingId),
  ]);
  let confirmedDuplicate = 0;
  const confirmedToCopy: ConfirmedSymbol[] = [];
  for (const c of sourceConfirmed) {
    const dup = targetConfirmed.find(
      (t) =>
        t.symbolType === c.symbolType &&
        t.pageNumber === c.pageNumber &&
        normalizedRectOverlapRatio(t.normalizedPosition, c.normalizedPosition) >= CONFIRMED_DEDUPE_IOU
    );
    if (dup) {
      confirmedDuplicate++;
      conflicts.push({
        collection: "confirmedSymbols",
        sourceId: c.id,
        reason: "duplicate_bbox",
        matchedTargetId: dup.id,
      });
    } else {
      confirmedToCopy.push(c);
    }
  }

  // ---- takeoffItems --------------------------------------------------
  const [sourceItems, targetItems] = await Promise.all([
    listTakeoffItems(projectId, fromDrawingId),
    listTakeoffItems(projectId, toDrawingId),
  ]);
  let itemsDuplicate = 0;
  const itemsToCopy: TakeoffItem[] = [];
  for (const i of sourceItems) {
    const dup = targetItems.find(
      (t) =>
        t.name.trim().toLowerCase() === i.name.trim().toLowerCase() &&
        t.profession === i.profession &&
        t.unit === i.unit
    );
    if (dup) {
      itemsDuplicate++;
      conflicts.push({
        collection: "takeoffItems",
        sourceId: i.id,
        reason: "duplicate_name",
        matchedTargetId: dup.id,
      });
    } else {
      itemsToCopy.push(i);
    }
  }

  // ---- takeoffEvidence --------------------------------------------------
  // Evidence isn't indexed by drawingId in Firestore queries — gather it
  // through the confirmed symbols we already loaded (their natural owner).
  const sourceEvidenceLists = await Promise.all(
    sourceConfirmed.map((c) => listTakeoffEvidenceForConfirmedSymbol(projectId, c.id))
  );
  const sourceEvidence = sourceEvidenceLists.flat();
  const targetEvidenceLists = await Promise.all(
    targetConfirmed.map((c) => listTakeoffEvidenceForConfirmedSymbol(projectId, c.id))
  );
  const targetEvidenceConfirmedIds = new Set(targetEvidenceLists.flat().map((e) => e.confirmedSymbolId));
  let evidenceDuplicate = 0;
  const evidenceToCopy: TakeoffEvidence[] = [];
  for (const e of sourceEvidence) {
    if (e.confirmedSymbolId && targetEvidenceConfirmedIds.has(e.confirmedSymbolId)) {
      evidenceDuplicate++;
      conflicts.push({ collection: "takeoffEvidence", sourceId: e.id, reason: "duplicate_bbox" });
    } else {
      evidenceToCopy.push(e);
    }
  }

  // ---- symbolTemplates --------------------------------------------------
  // Shared at project level — never drawing-scoped, nothing to migrate.
  const templates = await listSymbolTemplatesForProject(projectId).catch(() => []);

  const result: MergeTakeoffDrawingDataResult = {
    projectId,
    fromDrawingId,
    toDrawingId,
    dryRun,
    collections: {
      drawingRegions: {
        totalInSource: sourceRegions.length,
        duplicateRisks: regionsDuplicate,
        wouldCopy: regionsToCopy.length,
        copied: 0,
      },
      symbolCandidates: {
        totalInSource: sourceCandidates.length,
        duplicateRisks: candidatesDuplicate,
        wouldCopy: candidatesToCopy.length,
        copied: 0,
      },
      confirmedSymbols: {
        totalInSource: sourceConfirmed.length,
        duplicateRisks: confirmedDuplicate,
        wouldCopy: confirmedToCopy.length,
        copied: 0,
      },
      takeoffItems: {
        totalInSource: sourceItems.length,
        duplicateRisks: itemsDuplicate,
        wouldCopy: itemsToCopy.length,
        copied: 0,
      },
      takeoffEvidence: {
        totalInSource: sourceEvidence.length,
        duplicateRisks: evidenceDuplicate,
        wouldCopy: evidenceToCopy.length,
        copied: 0,
      },
      symbolTemplates: {
        totalInSource: templates.length,
        duplicateRisks: 0,
        wouldCopy: 0,
        copied: 0,
        note: "project-scoped, not migrated",
      },
    },
    conflicts,
  };

  if (dryRun) return result;

  // ---- Actual mode: copy + mark originals ------------------------------
  const now = new Date().toISOString();

  for (const r of regionsToCopy) {
    const id = newId("reg");
    await setDoc(
      doc(db, "projects", projectId, "drawingRegions", id),
      stripUndefined({ ...r, id: undefined, drawingId: toDrawingId, createdAt: now, updatedAt: now })
    );
    await updateDoc(
      doc(db, "projects", projectId, "drawingRegions", r.id),
      { migratedToDrawingId: toDrawingId, updatedAt: now } as Record<string, unknown>
    );
    result.collections.drawingRegions.copied++;
  }

  for (const c of candidatesToCopy) {
    const id = newId("cand");
    await setDoc(
      doc(db, "projects", projectId, "symbolCandidates", id),
      stripUndefined({ ...c, id: undefined, drawingId: toDrawingId, createdAt: now, updatedAt: now })
    );
    await updateDoc(
      doc(db, "projects", projectId, "symbolCandidates", c.id),
      { migratedToDrawingId: toDrawingId, updatedAt: now } as Record<string, unknown>
    );
    result.collections.symbolCandidates.copied++;
  }

  // Confirmed symbols copy without quantity changes — quantityValue is
  // carried over verbatim, never recomputed by this helper.
  const confirmedIdMap = new Map<string, string>();
  for (const c of confirmedToCopy) {
    const id = newId("csym");
    confirmedIdMap.set(c.id, id);
    await setDoc(
      doc(db, "projects", projectId, "confirmedSymbols", id),
      stripUndefined({
        ...c,
        id: undefined,
        drawingId: toDrawingId,
        candidateId: null,
        createdAt: now,
        updatedAt: now,
      })
    );
    await updateDoc(
      doc(db, "projects", projectId, "confirmedSymbols", c.id),
      { migratedToDrawingId: toDrawingId, updatedAt: now } as Record<string, unknown>
    );
    result.collections.confirmedSymbols.copied++;
  }

  for (const i of itemsToCopy) {
    const id = newId("item");
    await setDoc(
      doc(db, "projects", projectId, "takeoffItems", id),
      stripUndefined({ ...i, id: undefined, drawingId: toDrawingId, createdAt: now, updatedAt: now })
    );
    await updateDoc(
      doc(db, "projects", projectId, "takeoffItems", i.id),
      { migratedToDrawingId: toDrawingId, updatedAt: now } as Record<string, unknown>
    );
    result.collections.takeoffItems.copied++;
  }

  for (const e of evidenceToCopy) {
    const id = newId("tev");
    const remappedConfirmedId = e.confirmedSymbolId
      ? confirmedIdMap.get(e.confirmedSymbolId) ?? e.confirmedSymbolId
      : e.confirmedSymbolId;
    await setDoc(
      doc(db, "projects", projectId, "takeoffEvidence", id),
      stripUndefined({
        ...e,
        id: undefined,
        drawingId: toDrawingId,
        confirmedSymbolId: remappedConfirmedId,
        createdAt: now,
      })
    );
    result.collections.takeoffEvidence.copied++;
  }

  const backupLogId = newId("mergelog");
  await setDoc(doc(db, "projects", projectId, "takeoffMergeLogs", backupLogId), {
    projectId,
    fromDrawingId,
    toDrawingId,
    result: stripUndefined(result),
    createdAt: now,
  });
  result.backupLogId = backupLogId;

  return result;
}
