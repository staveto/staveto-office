/**
 * Canonical drawing identity — async resolution + alias bookkeeping.
 *
 * Problem: the quote AI-setup flow historically used an AI draft file id as
 * the takeoff `drawingId`. Project Documents / /takeoff always used the
 * Firestore project-document id. When the SAME PDF exists in both places
 * (e.g. it was imported from the AI draft into Documents), those two ids
 * differ and takeoff data fragments across them.
 *
 * resolveCanonicalDrawingId() looks for a project document that already
 * represents the same physical file (by matching file name — the only
 * signal both flows have in common without extra plumbing) and, when found,
 * returns the DOCUMENT id as canonical. It never migrates or deletes data by
 * itself — see takeoffDrawingMergeService.ts for that, and it records a
 * `drawingAliases` doc so the UI can offer the merge helper when old data
 * exists under the original file id.
 *
 * Paths (covered by the existing projects/{projectId}/{subcol} catch-all
 * security rule — no new Firestore rules needed):
 *  - projects/{projectId}/drawingAliases/{aliasFileId}
 */

import {
  getFirestoreInstance,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "@/lib/firebase";
import { listProjectDocuments } from "@/services/projects/projectDocuments";
import {
  listConfirmedSymbolsForDrawing,
  listSymbolCandidatesForDrawing,
  listTakeoffItems,
} from "@/services/takeoff/pdfTakeoffRegionService";
import { listDrawingOccurrences } from "@/services/takeoff/drawingOccurrenceService";

export type DrawingAlias = {
  /** Old id (e.g. AI draft fileId) — doc id under drawingAliases. */
  aliasId: string;
  canonicalDrawingId: string;
  projectId: string;
  source: "quote_ai_file" | "project_document";
  hasLegacyData?: boolean;
  legacyDataCounts?: {
    symbolCandidates: number;
    confirmedSymbols: number;
    takeoffItems: number;
    drawingOccurrences: number;
  };
  createdAt: string;
  updatedAt: string;
};

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Alias ids may be legacy FILE NAMES — "/" would break the Firestore path. */
function safeAliasDocId(aliasId: string): string {
  return aliasId.replace(/\//g, "_");
}

/** Best-effort legacy-data probe under an old drawingId (used to decide whether to warn). */
export async function countLegacyTakeoffData(
  projectId: string,
  drawingId: string
): Promise<DrawingAlias["legacyDataCounts"]> {
  const [candidates, confirmed, items, occurrences] = await Promise.all([
    listSymbolCandidatesForDrawing(projectId, drawingId).catch(() => []),
    listConfirmedSymbolsForDrawing(projectId, drawingId).catch(() => []),
    listTakeoffItems(projectId, drawingId).catch(() => []),
    listDrawingOccurrences(projectId, drawingId).catch(() => []),
  ]);
  return {
    symbolCandidates: candidates.length,
    confirmedSymbols: confirmed.length,
    takeoffItems: items.length,
    drawingOccurrences: occurrences.length,
  };
}

function hasAnyLegacyData(counts: DrawingAlias["legacyDataCounts"]): boolean {
  if (!counts) return false;
  return (
    counts.symbolCandidates > 0 ||
    counts.confirmedSymbols > 0 ||
    counts.takeoffItems > 0 ||
    counts.drawingOccurrences > 0
  );
}

export async function upsertDrawingAlias(
  alias: Omit<DrawingAlias, "createdAt" | "updatedAt">
): Promise<DrawingAlias> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const now = new Date().toISOString();
  const aliasDocId = safeAliasDocId(alias.aliasId);
  const existing = await getDoc(
    doc(db, "projects", alias.projectId, "drawingAliases", aliasDocId)
  );
  const record: DrawingAlias = {
    ...alias,
    createdAt: existing.exists()
      ? ((existing.data() as DrawingAlias).createdAt ?? now)
      : now,
    updatedAt: now,
  };
  await setDoc(
    doc(db, "projects", alias.projectId, "drawingAliases", aliasDocId),
    stripUndefined(record)
  );
  return record;
}

export async function getDrawingAlias(
  projectId: string,
  aliasFileId: string
): Promise<DrawingAlias | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  const snap = await getDoc(
    doc(db, "projects", projectId, "drawingAliases", safeAliasDocId(aliasFileId))
  );
  if (!snap.exists()) return null;
  return snap.data() as DrawingAlias;
}

export async function listDrawingAliasesForProject(projectId: string): Promise<DrawingAlias[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const snap = await getDocs(collection(db, "projects", projectId, "drawingAliases"));
  return snap.docs.map((d) => d.data() as DrawingAlias);
}

export type ResolveCanonicalDrawingIdParams = {
  projectId: string;
  /** AI draft / quote-flow file id — the value quote takeoff used to key on. */
  fileId: string;
  fileName?: string | null;
};

export type ResolveCanonicalDrawingIdResult = {
  canonicalDrawingId: string;
  /** True when the canonical id differs from the input fileId. */
  remapped: boolean;
  /** Set when remapped (or when a warning is worth surfacing) — old id. */
  aliasFileId?: string;
  /** True when takeoff data exists under aliasFileId that a merge would pick up. */
  hasLegacyDataUnderAlias: boolean;
  legacyDataCounts?: DrawingAlias["legacyDataCounts"];
  /**
   * The matched project document (when canonical id is a Documents doc).
   * Lets callers render the EXACT same file the Documents flow renders
   * instead of a possibly different quote-side copy.
   */
  canonicalDocument?: {
    id: string;
    fileName: string;
    mimeType: string;
    storagePath: string;
  };
};

/**
 * Resolve the quote flow's AI-draft `fileId` to the SAME canonical
 * drawingId that Project Documents / /takeoff would use for the same PDF.
 *
 * Matching order (all best-effort, never destructive — on any doubt this
 * falls back to the original fileId):
 *  1. exact document id — fileId already IS a project document (1:1 mirror);
 *  2. previously stored drawingAliases record — stable across renames and
 *     sessions once a mapping was established;
 *  3. exact file-name match — the "imported from AI draft into Documents"
 *     case where the new project document got a different id;
 *  4. single-PDF fallback — when the project has exactly ONE PDF document,
 *     the quote's plan and that document are the same physical file in
 *     practice (the quote flow only ever works with the project's plan);
 *     without this, a mere file rename would fragment takeoff data between
 *     quote and Documents forever.
 */
export async function resolveCanonicalDrawingId(
  params: ResolveCanonicalDrawingIdParams
): Promise<ResolveCanonicalDrawingIdResult> {
  const { projectId, fileId, fileName } = params;
  if (!fileId?.trim()) {
    return { canonicalDrawingId: fileId, remapped: false, hasLegacyDataUnderAlias: false };
  }

  let documents: Awaited<ReturnType<typeof listProjectDocuments>> = [];
  try {
    documents = await listProjectDocuments(projectId);
  } catch {
    return { canonicalDrawingId: fileId, remapped: false, hasLegacyDataUnderAlias: false };
  }

  const toCanonicalDocument = (d: (typeof documents)[number]) => ({
    id: d.id,
    fileName: d.fileName,
    mimeType: d.mimeType,
    storagePath: d.storagePath,
  });

  // 1. fileId already IS a real document id (same-id mirror case) — canonical.
  const directMatch = documents.find((d) => d.id === fileId);
  if (directMatch) {
    return {
      canonicalDrawingId: fileId,
      remapped: false,
      hasLegacyDataUnderAlias: false,
      canonicalDocument: toCanonicalDocument(directMatch),
    };
  }

  // 2. Stored alias from an earlier resolution — reuse when still valid.
  const storedAlias = await getDrawingAlias(projectId, fileId).catch(() => null);
  const aliasTarget =
    storedAlias && documents.some((d) => d.id === storedAlias.canonicalDrawingId)
      ? documents.find((d) => d.id === storedAlias.canonicalDrawingId)
      : undefined;

  // 3. Exact file-name match.
  const normalizedName = fileName?.trim().toLowerCase();
  const nameMatch = normalizedName
    ? documents.find((d) => d.fileName?.trim().toLowerCase() === normalizedName)
    : undefined;

  // 4. Single-PDF fallback — one plan in Documents ⇒ same physical file.
  // Same PDF detection the /takeoff page uses: mimeType OR .pdf file name.
  const pdfDocuments = documents.filter(
    (d) =>
      d.mimeType === "application/pdf" ||
      (d.fileName ?? "").toLowerCase().endsWith(".pdf")
  );
  const singlePdfMatch = pdfDocuments.length === 1 ? pdfDocuments[0] : undefined;

  const match = aliasTarget ?? nameMatch ?? singlePdfMatch;
  if (!match) {
    return { canonicalDrawingId: fileId, remapped: false, hasLegacyDataUnderAlias: false };
  }

  const canonicalDrawingId = match.id;
  const legacyDataCounts = await countLegacyTakeoffData(projectId, fileId);
  const hasLegacyDataUnderAlias = hasAnyLegacyData(legacyDataCounts);

  await upsertDrawingAlias({
    aliasId: fileId,
    canonicalDrawingId,
    projectId,
    source: "quote_ai_file",
    hasLegacyData: hasLegacyDataUnderAlias,
    legacyDataCounts,
  }).catch(() => undefined); // best-effort — resolution must not fail on a write error

  return {
    canonicalDrawingId,
    remapped: true,
    aliasFileId: fileId,
    hasLegacyDataUnderAlias,
    legacyDataCounts,
    canonicalDocument: toCanonicalDocument(match),
  };
}
