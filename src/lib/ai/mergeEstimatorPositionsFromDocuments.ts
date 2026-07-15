/**
 * Merge estimator positions from multiple documents into one combined takeoff.
 *
 * Pure functions — no Firestore. Used when
 * NEXT_PUBLIC_ENABLE_AI_MULTI_DOCUMENT_ESTIMATOR=1.
 */

import type {
  EstimatorDocument,
  EstimatorEvidenceAnchor,
  EstimatorPosition,
  EstimatorQuantityConflict,
  EstimatorQuantitySource,
} from "@/types/estimatorPositions";

export type MergePositionsInput = {
  documents: EstimatorDocument[];
  positionsByDocument: Map<string, EstimatorPosition[]> | Record<string, EstimatorPosition[]>;
  /** When true, schedule rows are valid without bbox (list-only projects). */
  scheduleOnly?: boolean;
};

export type MergePositionsResult = {
  positions: EstimatorPosition[];
  conflicts: EstimatorQuantityConflict[];
};

function entriesOf(
  map: Map<string, EstimatorPosition[]> | Record<string, EstimatorPosition[]>
): [string, EstimatorPosition[]][] {
  if (map instanceof Map) return [...map.entries()];
  return Object.entries(map);
}

/** Stable identity for merging the same item across documents. */
export function positionMergeKey(p: EstimatorPosition): string {
  return [
    p.trade,
    p.category,
    p.normalizedPoint,
    (p.roomName ?? "").trim().toLowerCase(),
    p.unit,
  ].join("||");
}

function isLegendOnlyAnchor(a: EstimatorEvidenceAnchor): boolean {
  return a.sourceType === "project_legend";
}

/** Position carries quantity only from legend text — no drawing/schedule/visual qty row. */
export function isLegendOnlyPosition(p: EstimatorPosition): boolean {
  if (p.evidenceAnchors.length === 0) return false;
  const hasNonLegend = p.evidenceAnchors.some((a) => !isLegendOnlyAnchor(a));
  if (hasNonLegend) return false;
  return p.quantitySource === "legend" || p.quantitySource === "unknown";
}

function isDrawingQuantitySource(src: EstimatorQuantitySource): boolean {
  return src === "drawing_detection" || src === "visual_detection";
}

function isScheduleQuantitySource(src: EstimatorQuantitySource): boolean {
  return src === "schedule";
}

function drawingQtyOf(p: EstimatorPosition): number | undefined {
  if (!isDrawingQuantitySource(p.quantitySource)) return undefined;
  return p.quantity > 0 ? p.quantity : undefined;
}

function scheduleQtyOf(p: EstimatorPosition): number | undefined {
  if (!isScheduleQuantitySource(p.quantitySource)) return undefined;
  return p.quantity > 0 ? p.quantity : undefined;
}

function mergeAnchors(
  existing: EstimatorEvidenceAnchor[],
  incoming: EstimatorEvidenceAnchor[]
): EstimatorEvidenceAnchor[] {
  const byId = new Map<string, EstimatorEvidenceAnchor>();
  for (const a of [...existing, ...incoming]) {
    if (!byId.has(a.id)) byId.set(a.id, a);
  }
  return [...byId.values()];
}

function mergeSourceDocuments(
  existing: string[] | undefined,
  incoming: string[] | undefined,
  ...documentIds: string[]
): string[] {
  const set = new Set(existing ?? []);
  for (const id of incoming ?? []) set.add(id);
  for (const id of documentIds) {
    if (id) set.add(id);
  }
  return [...set];
}

function pickPrimaryQuantity(
  drawingQty: number | undefined,
  scheduleQty: number | undefined,
  scheduleOnly: boolean
): { quantity: number; quantitySource: EstimatorQuantitySource } {
  if (scheduleOnly && scheduleQty != null) {
    return { quantity: scheduleQty, quantitySource: "schedule" };
  }
  if (drawingQty != null && scheduleQty == null) {
    return { quantity: drawingQty, quantitySource: "drawing_detection" };
  }
  if (scheduleQty != null && drawingQty == null) {
    return { quantity: scheduleQty, quantitySource: "schedule" };
  }
  if (drawingQty != null) {
    return { quantity: drawingQty, quantitySource: "drawing_detection" };
  }
  if (scheduleQty != null) {
    return { quantity: scheduleQty, quantitySource: "schedule" };
  }
  return { quantity: 0, quantitySource: "unknown" };
}

function makeConflictId(positionId: string): string {
  return `conflict_${positionId}`;
}

/**
 * Merge positions from multiple documents. Legend-only rows enrich existing
 * matches instead of duplicating quantity. Drawing vs schedule qty mismatches
 * produce open conflicts — quantity is never silently resolved.
 */
export function mergeEstimatorPositionsFromDocuments(
  input: MergePositionsInput
): MergePositionsResult {
  const { scheduleOnly = false } = input;
  const conflicts: EstimatorQuantityConflict[] = [];

  type Grouped = {
    primary: EstimatorPosition;
    extras: EstimatorPosition[];
    documentIds: string[];
  };

  const groups = new Map<string, Grouped>();

  for (const [documentId, positions] of entriesOf(input.positionsByDocument)) {
    for (const pos of positions) {
      const key = positionMergeKey(pos);
      const existing = groups.get(key);

      if (isLegendOnlyPosition(pos) && existing) {
        existing.primary = {
          ...existing.primary,
          evidenceAnchors: mergeAnchors(existing.primary.evidenceAnchors, pos.evidenceAnchors),
          sourceDocuments: mergeSourceDocuments(
            existing.primary.sourceDocuments,
            pos.sourceDocuments,
            documentId
          ),
        };
        continue;
      }

      if (!existing) {
        groups.set(key, {
          primary: {
            ...pos,
            sourceDocuments: mergeSourceDocuments(pos.sourceDocuments, undefined, documentId),
          },
          extras: [],
          documentIds: [documentId],
        });
        continue;
      }

      existing.extras.push(pos);
      if (!existing.documentIds.includes(documentId)) {
        existing.documentIds.push(documentId);
      }
    }
  }

  const merged: EstimatorPosition[] = [];

  for (const { primary, extras, documentIds } of groups.values()) {
    let combined = { ...primary };
    let drawingQty = drawingQtyOf(primary);
    let scheduleQty = scheduleQtyOf(primary);

    for (const extra of extras) {
      if (isLegendOnlyPosition(extra)) {
        combined = {
          ...combined,
          evidenceAnchors: mergeAnchors(combined.evidenceAnchors, extra.evidenceAnchors),
          sourceDocuments: mergeSourceDocuments(combined.sourceDocuments, extra.sourceDocuments),
        };
        continue;
      }

      combined = {
        ...combined,
        evidenceAnchors: mergeAnchors(combined.evidenceAnchors, extra.evidenceAnchors),
        sourceDocuments: mergeSourceDocuments(
          combined.sourceDocuments,
          extra.sourceDocuments
        ),
      };

      const dQty = drawingQtyOf(extra);
      const sQty = scheduleQtyOf(extra);
      if (dQty != null) drawingQty = dQty;
      if (sQty != null) scheduleQty = sQty;
    }

    combined.sourceDocuments = mergeSourceDocuments(
      combined.sourceDocuments,
      undefined,
      ...documentIds
    );

    const hasQtyConflict =
      drawingQty != null &&
      scheduleQty != null &&
      Math.abs(drawingQty - scheduleQty) > 0.001;

    if (hasQtyConflict) {
      conflicts.push({
        id: makeConflictId(combined.id),
        positionId: combined.id,
        label: combined.label,
        roomName: combined.roomName,
        category: combined.category,
        drawingQty,
        scheduleQty,
        unit: combined.unit,
        status: "open",
      });
      combined = {
        ...combined,
        reviewStatus: "needs_review",
        reviewReason:
          combined.reviewReason ??
          `${combined.label}: výkres ${drawingQty} ${combined.unit}, výkaz ${scheduleQty} ${combined.unit} — skontrolovať.`,
        quantity: drawingQty ?? scheduleQty ?? 0,
        quantitySource: "unknown",
      };
    } else {
      const picked = pickPrimaryQuantity(drawingQty, scheduleQty, scheduleOnly);
      combined = {
        ...combined,
        quantity: picked.quantity > 0 ? picked.quantity : combined.quantity,
        quantitySource:
          picked.quantity > 0 ? picked.quantitySource : combined.quantitySource,
      };
    }

    if (scheduleOnly && !combined.evidenceAnchors.some((a) => a.bbox)) {
      combined = {
        ...combined,
        reviewStatus:
          combined.reviewStatus === "confirmed" ? "confirmed" : "needs_review",
      };
    }

    merged.push(combined);
  }

  merged.sort((a, b) => a.positionCode.localeCompare(b.positionCode));

  return { positions: merged, conflicts };
}

/** Resolve which document/page to show when a position is selected. */
export function resolveSelectionTarget(
  position: EstimatorPosition,
  documents: EstimatorDocument[]
): { documentId: string | null; page: number; fileName: string | null } {
  const anchor =
    position.evidenceAnchors.find((a) => a.bbox != null) ??
    position.evidenceAnchors[0];
  if (!anchor) {
    return { documentId: null, page: 1, fileName: null };
  }

  const documentId =
    anchor.documentId ??
    documents.find(
      (d) => d.fileName === anchor.fileName || d.fileId === anchor.fileId
    )?.id ??
    null;

  return {
    documentId,
    page: anchor.page > 0 ? anchor.page : 1,
    fileName: anchor.fileName,
  };
}

/** Filter positions that have evidence in the given document. */
export function positionsForDocument(
  positions: EstimatorPosition[],
  documentId: string,
  documents: EstimatorDocument[]
): EstimatorPosition[] {
  const doc = documents.find((d) => d.id === documentId);
  if (!doc) return positions;

  return positions.filter((p) =>
    p.evidenceAnchors.some(
      (a) =>
        a.documentId === documentId ||
        a.fileName === doc.fileName ||
        a.fileId === doc.fileId
    ) ||
    (p.sourceDocuments ?? []).includes(documentId)
  );
}

/** Open conflicts for a position or session. */
export function openConflicts(
  conflicts: EstimatorQuantityConflict[]
): EstimatorQuantityConflict[] {
  return conflicts.filter((c) => c.status === "open");
}

/** Position ids with open conflicts. */
export function positionIdsWithOpenConflicts(
  conflicts: EstimatorQuantityConflict[]
): Set<string> {
  return new Set(openConflicts(conflicts).map((c) => c.positionId));
}
