/**
 * Hard-delete a project and all client-writable related data.
 * Used by deleteProject — Firestore does not cascade subcollections.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentReference,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";
import { deleteObject, listAll, ref, type ListResult } from "firebase/storage";
import { getAuthInstance, getFirestoreInstance, getStorageInstance } from "@/lib/firebase";
import { getProject } from "@/lib/projects";

/** Known project subcollections (takeoff, quote, ops, mobile compat). */
const PROJECT_SUBCOLLECTIONS = [
  "tasks",
  "expenses",
  "quoteItems",
  "materials",
  "materialSuggestions",
  "documents",
  "members",
  "phases",
  "problems",
  "constructionDiary",
  "attachments",
  "events",
  "activity",
  "symbolCandidates",
  "confirmedSymbols",
  "takeoffItems",
  "takeoffEvidence",
  "symbolTemplates",
  "drawingAliases",
  "drawingRegions",
  "drawingScaleCalibrations",
  "drawingMeasurements",
  "cableRuns",
  "drawingAnnotations",
  "drawingOccurrences",
  "stats",
  "phaseStats",
] as const;

const BATCH_SIZE = 400;

async function deleteQueryInBatches(db: Firestore, path: string): Promise<number> {
  let deleted = 0;
  // Loop until empty — subcollections can exceed one page.
  for (;;) {
    const snap = await getDocs(collection(db, path));
    if (snap.empty) break;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + BATCH_SIZE);
      for (const d of chunk) batch.delete(d.ref);
      await batch.commit();
      deleted += chunk.length;
    }
    if (docs.length < BATCH_SIZE) break;
  }
  return deleted;
}

async function deleteStoragePrefix(prefix: string): Promise<number> {
  const storage = getStorageInstance();
  if (!storage) return 0;
  const root = ref(storage, prefix);
  let deleted = 0;

  async function walk(listing: ListResult): Promise<void> {
    for (const file of listing.items) {
      try {
        await deleteObject(file);
        deleted += 1;
      } catch {
        // Permission / already gone — continue.
      }
    }
    for (const folder of listing.prefixes) {
      try {
        await walk(await listAll(folder));
      } catch {
        // ignore
      }
    }
  }

  try {
    await walk(await listAll(root));
  } catch {
    // Prefix missing or denied.
  }
  return deleted;
}

async function deleteLinkedQuotes(db: Firestore, projectId: string): Promise<number> {
  const auth = getAuthInstance();
  const uid = auth?.currentUser?.uid;
  if (!uid) return 0;

  const project = await getProject(projectId);
  if (!project) return 0;

  const found = new Map<string, DocumentReference>();
  const tryQuery = async (constraints: QueryConstraint[]) => {
    try {
      const snap = await getDocs(query(collection(db, "quotes"), ...constraints));
      for (const d of snap.docs) found.set(d.id, d.ref);
    } catch {
      // Missing index / permission — skip this path.
    }
  };

  await tryQuery([where("projectId", "==", projectId), where("ownerId", "==", uid)]);
  if (project.orgId) {
    await tryQuery([where("projectId", "==", projectId), where("orgId", "==", project.orgId)]);
  }

  let deleted = 0;
  const refs = [...found.values()];
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = refs.slice(i, i + BATCH_SIZE);
    for (const r of chunk) batch.delete(r);
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

export type PurgeProjectResult = {
  subcollectionDocs: number;
  quotes: number;
  storageObjects: number;
};

/**
 * Delete all known project data, then the project document.
 * Does not delete estimatorSessions (rules: client delete forbidden) or membersByUid (CF-only).
 */
export async function purgeProjectCompletely(projectId: string): Promise<PurgeProjectResult> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const id = projectId.trim();
  if (!id) throw new Error("Project id required");

  let subcollectionDocs = 0;
  for (const sub of PROJECT_SUBCOLLECTIONS) {
    try {
      subcollectionDocs += await deleteQueryInBatches(db, `projects/${id}/${sub}`);
    } catch {
      // Subcollection missing or not writable — continue.
    }
  }

  let quotes = 0;
  try {
    quotes = await deleteLinkedQuotes(db, id);
  } catch {
    // continue
  }

  let storageObjects = 0;
  try {
    storageObjects = await deleteStoragePrefix(`projects/${id}`);
  } catch {
    // continue
  }

  await deleteDoc(doc(db, "projects", id));

  return { subcollectionDocs, quotes, storageObjects };
}
