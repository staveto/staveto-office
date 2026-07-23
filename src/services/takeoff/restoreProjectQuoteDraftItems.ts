/**
 * Recover an emptied project quote draft.
 *
 * Prefer restoring from the linked Cenové ponuky snapshot (keeps prices),
 * otherwise rebuild rows from confirmed takeoff marks on the drawings.
 */

import {
  collection,
  getDocs,
  getFirestoreInstance,
} from "@/lib/firebase";
import {
  createQuoteDraftItem,
  listProjectQuoteDraftItems,
} from "@/lib/projects";
import { listQuotesForProject } from "@/lib/quotes";
import type { QuoteDoc } from "@/lib/quotes";
import type { ActiveWorkspace, Workspace } from "@/types/workspace";
import type { SymbolCandidate } from "@/types/pdfTakeoff";
import { dtoFromSymbolCandidate } from "@/lib/takeoff/candidateReview";
import { categoryLabelForCandidate } from "@/lib/takeoff/takeoffCategories";
import {
  dedupeProjectQuoteDraftItems,
  reconcileDrawingQuoteItemsFromConfirmedMarks,
} from "./takeoffQuoteService";

export type RestoreQuoteDraftResult = {
  restored: number;
  source: "quote_snapshot" | "takeoff" | "none";
  deduped: number;
};

async function listAllSymbolCandidates(
  projectId: string
): Promise<SymbolCandidate[]> {
  const db = getFirestoreInstance();
  if (!db) return [];
  const snap = await getDocs(
    collection(db, "projects", projectId, "symbolCandidates")
  );
  return snap.docs.map((d) => ({
    ...(d.data() as Omit<SymbolCandidate, "id">),
    id: d.id,
  }));
}

async function restoreFromQuoteSnapshot(
  projectId: string,
  draftQuote: QuoteDoc
): Promise<number> {
  let created = 0;
  for (const item of draftQuote.items) {
    const name = item.name?.trim();
    if (!name) continue;
    await createQuoteDraftItem(projectId, {
      category: item.category === "work" ? "work" : "material",
      name,
      qty: item.qty > 0 ? item.qty : 1,
      unit: item.unit || "ks",
      unitPrice: item.unitPrice >= 0 ? item.unitPrice : 0,
    });
    created += 1;
  }
  return created;
}

async function restoreFromTakeoffMarks(projectId: string): Promise<number> {
  const candidates = await listAllSymbolCandidates(projectId);
  const confirmed = candidates.filter((c) => c.status === "confirmed");
  if (confirmed.length === 0) return 0;

  const byDrawing = new Map<string, SymbolCandidate[]>();
  for (const c of confirmed) {
    const drawingId = c.drawingId?.trim();
    if (!drawingId) continue;
    const list = byDrawing.get(drawingId) ?? [];
    list.push(c);
    byDrawing.set(drawingId, list);
  }

  let created = 0;
  for (const [drawingId, rows] of byDrawing) {
    const labels = rows.map((c) =>
      categoryLabelForCandidate(dtoFromSymbolCandidate(c))
    );
    const result = await reconcileDrawingQuoteItemsFromConfirmedMarks({
      projectId,
      drawingId,
      confirmedLabels: labels,
    });
    created += result.created;
  }
  return created;
}

/**
 * If `projects/{id}/quoteItems` is empty, try to bring items back.
 * Always collapses duplicate name+unit rows (safe on every quote-tab load).
 */
export async function restoreProjectQuoteDraftItemsIfEmpty(params: {
  projectId: string;
  workspace: Workspace | ActiveWorkspace | null | undefined;
  uid: string | null | undefined;
}): Promise<RestoreQuoteDraftResult> {
  const existing = await listProjectQuoteDraftItems(params.projectId);
  if (existing.length > 0) {
    const { removed } = await dedupeProjectQuoteDraftItems(params.projectId);
    return { restored: 0, source: "none", deduped: removed };
  }

  let restored = 0;
  let source: RestoreQuoteDraftResult["source"] = "none";

  if (params.workspace && params.uid) {
    try {
      const quotes = await listQuotesForProject(
        params.projectId,
        params.workspace,
        params.uid
      );
      const draft = quotes.find((q) => q.status === "draft" && q.items.length > 0);
      if (draft) {
        restored = await restoreFromQuoteSnapshot(params.projectId, draft);
        if (restored > 0) source = "quote_snapshot";
      }
    } catch {
      /* fall through to takeoff */
    }
  }

  // Attach / fill from marks without creating a second row for the same name.
  try {
    const fromMarks = await restoreFromTakeoffMarks(params.projectId);
    if (source === "none" && fromMarks > 0) {
      restored = fromMarks;
      source = "takeoff";
    }
  } catch {
    /* best-effort */
  }

  const { removed } = await dedupeProjectQuoteDraftItems(params.projectId);
  return { restored, source, deduped: removed };
}
