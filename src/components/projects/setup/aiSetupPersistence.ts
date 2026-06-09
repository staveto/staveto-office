import {
  createQuoteDraftItem,
  deleteQuoteDraftItem,
  getProject,
  listProjectQuoteDraftItems,
  updateQuoteDraftItem,
} from "@/lib/projects";
import { getFirestoreInstance, doc, getDoc } from "@/lib/firebase";
import { normalizeSetupUnit } from "./aiSetupHelpers";
import type { AiSetupMaterialRow, AiSetupWorkEstimate } from "./aiSetupTypes";
import type { QuoteDraftItemInput } from "@/lib/quoteDraftItems";

async function quoteDraftItemExists(projectId: string, itemId: string): Promise<boolean> {
  const db = getFirestoreInstance();
  if (!db) return false;
  const snap = await getDoc(doc(db, "projects", projectId, "quoteItems", itemId));
  return snap.exists();
}

async function upsertQuoteDraftItem(
  projectId: string,
  itemId: string | undefined,
  payload: QuoteDraftItemInput
): Promise<string> {
  if (itemId && (await quoteDraftItemExists(projectId, itemId))) {
    await updateQuoteDraftItem(projectId, itemId, payload);
    return itemId;
  }
  return createQuoteDraftItem(projectId, payload);
}

export async function syncMaterialRowsToQuoteItems(
  projectId: string,
  rows: AiSetupMaterialRow[]
): Promise<AiSetupMaterialRow[]> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");

  const nextRows = [...rows];

  for (let i = 0; i < nextRows.length; i++) {
    const row = nextRows[i];
    if (!row.included || !row.name.trim()) {
      if (row.quoteItemId) {
        try {
          await deleteQuoteDraftItem(projectId, row.quoteItemId);
        } catch {
          // Item may already be gone — continue.
        }
        nextRows[i] = { ...row, quoteItemId: undefined };
      }
      continue;
    }

    const payload = {
      category: "material" as const,
      name: row.name.trim(),
      qty: row.qty > 0 ? row.qty : 1,
      unit: normalizeSetupUnit(row.unit),
      unitPrice: row.price >= 0 ? row.price : 0,
    };

    const id = await upsertQuoteDraftItem(projectId, row.quoteItemId, payload);
    nextRows[i] = { ...row, quoteItemId: id, id };
  }

  const fresh = await listProjectQuoteDraftItems(projectId);
  const materialIds = new Set(
    nextRows.filter((r) => r.quoteItemId).map((r) => r.quoteItemId!)
  );
  for (const item of fresh) {
    if (item.category === "material" && !materialIds.has(item.id)) {
      try {
        await deleteQuoteDraftItem(projectId, item.id);
      } catch {
        // Ignore stale deletes.
      }
    }
  }

  return nextRows;
}

export async function syncWorkEstimateToQuoteItems(
  projectId: string,
  work: AiSetupWorkEstimate,
  workLineLabel: string
): Promise<AiSetupWorkEstimate> {
  const fresh = await listProjectQuoteDraftItems(projectId);
  const legacyWorkIds = fresh.filter((i) => i.category === "work").map((i) => i.id);

  const noteParts = [
    work.workers > 0 ? `${work.workers}×` : null,
    work.note.trim() || null,
  ].filter(Boolean);

  const payload = {
    category: "work" as const,
    name: workLineLabel,
    qty: work.hours > 0 ? work.hours : 1,
    unit: "hour",
    unitPrice: work.hourlyRate >= 0 ? work.hourlyRate : 0,
    note: noteParts.length > 0 ? noteParts.join(" · ") : undefined,
  };

  const quoteItemId = await upsertQuoteDraftItem(projectId, work.quoteItemId, payload);

  for (const id of legacyWorkIds) {
    if (id !== quoteItemId) {
      try {
        await deleteQuoteDraftItem(projectId, id);
      } catch {
        // Ignore stale deletes.
      }
    }
  }

  return { ...work, quoteItemId };
}
