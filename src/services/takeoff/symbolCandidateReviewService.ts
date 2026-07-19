/**
 * Phase 2 — human review actions for region symbol candidates.
 *
 * confirm → confirmed_symbol + takeoff_item(+qty) + takeoff_evidence
 * reject  → candidate status rejected (no quantity change)
 * change-type / unknown → update candidate suggestions/status only
 *
 * Never writes quote draft lines here — takeoff items are the source of truth
 * until the user explicitly adds to quote (existing QuoteDraftPanel flow).
 */

import {
  applyConfirmToTakeoffItems,
  applyUnconfirmToTakeoffItems,
  defaultLabelForSymbolType,
  defaultSymbolTypeForCandidate,
  dtoFromSymbolCandidate,
  findDuplicateConfirmedSymbol,
  translateBboxPdfForMove,
} from "@/lib/takeoff/candidateReview";
import { chooseEvidenceImageUrl } from "@/lib/takeoff/takeoffImages";
import {
  createEvidenceImage,
  createTemplateImage,
} from "@/services/takeoff/takeoffImageService";
import type {
  AnalyzeRegionCandidateDto,
  BBoxPdf,
  ConfirmedSymbol,
} from "@/types/pdfTakeoff";
import type { NormalizedRect } from "@/types/drawingTakeoff";
import {
  createConfirmedSymbol,
  createSymbolTemplate,
  createTakeoffEvidence,
  deleteConfirmedSymbol,
  deleteSymbolCandidate,
  deleteTakeoffEvidence,
  deleteTakeoffItem,
  getConfirmedSymbolByCandidateId,
  getSymbolCandidate,
  listConfirmedSymbolsForPage,
  listTakeoffEvidenceForConfirmedSymbol,
  listTakeoffItems,
  updateConfirmedSymbolPosition,
  updateConfirmedSymbolType,
  updateSymbolCandidatePosition,
  updateSymbolCandidateStatus,
  updateTakeoffEvidenceItem,
  upsertTakeoffItem,
} from "@/services/takeoff/pdfTakeoffRegionService";

/**
 * Confirm hit an already-confirmed symbol at the same position. Carries the
 * existing symbol's metadata so the UI can offer "open existing evidence" /
 * "discard this candidate" instead of a dead-end error.
 */
export class DuplicateConfirmedSymbolError extends Error {
  readonly code = "DUPLICATE_CONFIRMED_SYMBOL";
  readonly existingSymbolId: string;
  readonly existingBboxPdf: BBoxPdf;
  readonly existingNormalizedPosition: NormalizedRect;
  readonly existingPageNumber: number;
  readonly existingTakeoffItemId: string | null;

  constructor(params: {
    existing: Pick<
      ConfirmedSymbol,
      "id" | "bboxPdf" | "normalizedPosition" | "pageNumber"
    >;
    existingTakeoffItemId?: string | null;
  }) {
    super("DUPLICATE_CONFIRMED_SYMBOL");
    this.name = "DuplicateConfirmedSymbolError";
    this.existingSymbolId = params.existing.id;
    this.existingBboxPdf = params.existing.bboxPdf;
    this.existingNormalizedPosition = params.existing.normalizedPosition;
    this.existingPageNumber = params.existing.pageNumber;
    this.existingTakeoffItemId = params.existingTakeoffItemId ?? null;
  }
}

export type ConfirmCandidateInput = {
  projectId: string;
  candidateId: string;
  symbol_type?: string;
  quantity_value?: number;
  quantity_unit?: string;
  create_template?: boolean;
  confirmedBy?: string;
  /** Optional in-memory DTO when Firestore row is not yet loaded. */
  candidateDto?: AnalyzeRegionCandidateDto;
  /**
   * Drawing PDF URL — enables evidence/template image generation (Phase 2.5).
   * When missing or rendering fails, confirmation proceeds with bbox-only
   * evidence (candidate preview reused when available).
   */
  fileUrl?: string | null;
};

export type ConfirmCandidateResult = {
  confirmedSymbolId: string;
  takeoffItemId: string;
  takeoffItemQuantity: number;
  evidenceId: string;
  candidate: AnalyzeRegionCandidateDto;
};

function newLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveCandidate(
  projectId: string,
  candidateId: string,
  dto?: AnalyzeRegionCandidateDto
): Promise<AnalyzeRegionCandidateDto> {
  if (dto && dto.id === candidateId) return dto;
  const row = await getSymbolCandidate(projectId, candidateId);
  if (!row) throw new Error("CANDIDATE_NOT_FOUND");
  return dtoFromSymbolCandidate(row);
}

/**
 * Serialize takeoff quantity RMW per drawing. Rapid category marking fires
 * overlapping confirms; without a lock, concurrent list→increment→upsert
 * loses counts (confirmed marks stay correct, výkaz undercounts).
 */
const confirmLocks = new Map<string, Promise<void>>();

function withConfirmLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = confirmLocks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  confirmLocks.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

export async function confirmSymbolCandidate(
  input: ConfirmCandidateInput
): Promise<ConfirmCandidateResult> {
  const rowEarly = await getSymbolCandidate(input.projectId, input.candidateId);
  const lockKey = `${input.projectId}:${rowEarly?.drawingId ?? input.candidateId}`;
  return withConfirmLock(lockKey, () => confirmSymbolCandidateUnlocked(input));
}

async function confirmSymbolCandidateUnlocked(
  input: ConfirmCandidateInput
): Promise<ConfirmCandidateResult> {
  const candidate = await resolveCandidate(
    input.projectId,
    input.candidateId,
    input.candidateDto
  );
  if (candidate.status === "rejected") {
    throw new Error("CANDIDATE_REJECTED");
  }
  if (candidate.status === "confirmed") {
    throw new Error("CANDIDATE_ALREADY_CONFIRMED");
  }

  const symbolType =
    input.symbol_type?.trim() || defaultSymbolTypeForCandidate(candidate);
  const quantityValue =
    typeof input.quantity_value === "number" && input.quantity_value > 0
      ? input.quantity_value
      : 1;
  const quantityUnit = input.quantity_unit?.trim() || "ks";
  const name =
    candidate.label_suggestions[0]?.label?.trim() ||
    defaultLabelForSymbolType(symbolType);
  const profession = "electrical";
  const now = new Date().toISOString();

  const row = await getSymbolCandidate(input.projectId, input.candidateId);
  const drawingId = row?.drawingId ?? "";
  const pageNumber = row?.pageNumber ?? candidate.page_number ?? 1;
  const bboxPdf = row?.bboxPdf ?? candidate.bbox_pdf;
  const normalizedPosition = row?.normalizedPosition ?? candidate.normalized_position;

  if (!drawingId) throw new Error("CANDIDATE_MISSING_DRAWING");

  // Duplicate protection: same drawing/page + overlapping bbox → refuse
  // before any write (no confirmedSymbol, no quantity, no evidence).
  const existingConfirmed = await listConfirmedSymbolsForPage(
    input.projectId,
    drawingId,
    pageNumber
  );
  const duplicate = findDuplicateConfirmedSymbol({
    existing: existingConfirmed,
    drawingId,
    pageNumber,
    normalizedPosition,
  });
  if (duplicate) {
    const existingEvidence = await listTakeoffEvidenceForConfirmedSymbol(
      input.projectId,
      duplicate.id
    ).catch(() => []);
    throw new DuplicateConfirmedSymbolError({
      existing: duplicate,
      existingTakeoffItemId: existingEvidence[0]?.takeoffItemId ?? null,
    });
  }

  await updateSymbolCandidateStatus(input.projectId, input.candidateId, {
    status: "confirmed",
    symbolTypeHint: symbolType,
  });

  // Phase 2.5 — best-effort evidence crop (never blocks confirmation).
  const confirmedSymbolId = newLocalId("csym");
  let generatedEvidenceUrl: string | null = null;
  if (input.fileUrl) {
    generatedEvidenceUrl = await createEvidenceImage({
      projectId: input.projectId,
      drawingId,
      confirmedSymbolId,
      fileUrl: input.fileUrl,
      pageNumber,
      normalizedPosition,
    }).catch((err) => {
      console.warn("[confirmSymbolCandidate] evidence image failed", err);
      return null;
    });
  }
  const evidenceImageUrl = chooseEvidenceImageUrl(
    generatedEvidenceUrl,
    candidate.preview_image_url
  );

  const confirmed = await createConfirmedSymbol({
    id: confirmedSymbolId,
    candidateId: input.candidateId,
    drawingId,
    projectId: input.projectId,
    pageNumber,
    bboxPdf,
    normalizedPosition,
    symbolType,
    profession,
    roomId: null,
    zoneId: null,
    quantityValue,
    quantityUnit,
    confirmedBy: input.confirmedBy,
    confirmationSource: "user",
    confidence: candidate.confidence,
    evidenceImageUrl,
  });

  const existingItems = await listTakeoffItems(input.projectId, drawingId);
  const { updatedItem, created } = applyConfirmToTakeoffItems({
    items: existingItems,
    projectId: input.projectId,
    drawingId,
    profession,
    symbolType,
    name,
    unit: quantityUnit,
    quantityValue,
    now,
    newItemId: newLocalId("titem"),
  });
  // Persist — if updating existing, keep id; create path already has id.
  void created;
  await upsertTakeoffItem(updatedItem);

  const evidence = await createTakeoffEvidence({
    takeoffItemId: updatedItem.id,
    confirmedSymbolId: confirmed.id,
    drawingId,
    projectId: input.projectId,
    pageNumber,
    bboxPdf,
    normalizedPosition,
    evidenceImageUrl,
  });

  if (input.create_template) {
    const templateId = newLocalId("tmpl");
    // Tight template crop — falls back to candidate preview when rendering fails.
    const templateImageUrl = input.fileUrl
      ? await createTemplateImage({
          projectId: input.projectId,
          drawingId,
          templateId,
          fileUrl: input.fileUrl,
          pageNumber,
          normalizedPosition,
        }).catch(() => null)
      : null;
    await createSymbolTemplate({
      id: templateId,
      projectId: input.projectId,
      companyId: null,
      profession,
      symbolType,
      label: name,
      colorLayer: candidate.color_layer,
      templateImageUrl: templateImageUrl ?? candidate.preview_image_url,
      maskImageUrl: null,
      createdFromSymbolId: confirmed.id,
      createdBy: input.confirmedBy,
    }).catch(() => undefined);
  }

  return {
    confirmedSymbolId: confirmed.id,
    takeoffItemId: updatedItem.id,
    takeoffItemQuantity: updatedItem.quantity,
    evidenceId: evidence.id,
    candidate: { ...candidate, status: "confirmed" },
  };
}

export async function rejectSymbolCandidate(input: {
  projectId: string;
  candidateId: string;
}): Promise<void> {
  await updateSymbolCandidateStatus(input.projectId, input.candidateId, {
    status: "rejected",
  });
}

export async function changeSymbolCandidateType(input: {
  projectId: string;
  candidateId: string;
  symbol_type: string;
  notes?: string;
  candidateDto?: AnalyzeRegionCandidateDto;
}): Promise<AnalyzeRegionCandidateDto> {
  const candidate = await resolveCandidate(
    input.projectId,
    input.candidateId,
    input.candidateDto
  );
  const label = defaultLabelForSymbolType(input.symbol_type);
  const suggestions = [
    { label, confidence: Math.max(candidate.confidence, 0.7) },
    ...candidate.label_suggestions.filter((s) => s.label !== label),
  ].slice(0, 4);

  await updateSymbolCandidateStatus(input.projectId, input.candidateId, {
    status: candidate.status === "unknown_type" ? "probable" : candidate.status,
    labelSuggestions: suggestions,
    symbolTypeHint: input.symbol_type,
    ...(input.notes
      ? { nearbyText: [candidate.nearby_text, input.notes].filter(Boolean).join(" · ") }
      : {}),
  });

  return {
    ...candidate,
    label_suggestions: suggestions,
    status: candidate.status === "unknown_type" ? "probable" : candidate.status,
  };
}

export async function markSymbolCandidateUnknownType(input: {
  projectId: string;
  candidateId: string;
}): Promise<void> {
  await updateSymbolCandidateStatus(input.projectId, input.candidateId, {
    status: "unknown_type",
    symbolTypeHint: "unknown",
  });
}

/**
 * Permanently delete a NOT-YET-confirmed candidate (candidate / probable /
 * rejected / unknown_type / needs_customer_info). Never touches takeoff
 * quantities — those are only ever created on confirm.
 */
export async function deleteCandidate(input: {
  projectId: string;
  candidateId: string;
}): Promise<void> {
  const row = await getSymbolCandidate(input.projectId, input.candidateId);
  if (row?.status === "confirmed") {
    throw new Error("CANDIDATE_CONFIRMED_USE_UNCONFIRM");
  }
  await deleteSymbolCandidate(input.projectId, input.candidateId);
}

/**
 * Delete a confirmed symbol, addressed by the CANDIDATE id it was confirmed
 * from (the review panel/overlay only ever track candidate ids — a
 * candidate keeps the same id through candidate → probable → confirmed).
 * Symmetric with confirmSymbolCandidate: gives back the exact
 * quantity/evidence it added (never touches unrelated items), removes its
 * evidence row(s), and removes the originating candidate so it doesn't
 * linger in a "confirmed" limbo with no backing confirmedSymbol doc.
 */
export async function unconfirmAndDeleteSymbol(input: {
  projectId: string;
  candidateId: string;
}): Promise<{ removedTakeoffItemId: string | null; updatedTakeoffItemId: string | null }> {
  const { projectId, candidateId } = input;
  const confirmed = await getConfirmedSymbolByCandidateId(projectId, candidateId);
  if (!confirmed) throw new Error("CONFIRMED_SYMBOL_NOT_FOUND");

  const [evidenceRows, items, candidateRow] = await Promise.all([
    listTakeoffEvidenceForConfirmedSymbol(projectId, confirmed.id),
    listTakeoffItems(projectId, confirmed.drawingId),
    getSymbolCandidate(projectId, candidateId).catch(() => null),
  ]);

  const now = new Date().toISOString();
  // The candidate's label is the mark's category/position name; the evidence
  // link pins the EXACT item to decrement (survives renames/splits).
  const name =
    candidateRow?.labelSuggestions?.[0]?.label?.trim() ||
    defaultLabelForSymbolType(confirmed.symbolType);
  const { updatedItem, removeItemId } = applyUnconfirmToTakeoffItems({
    items,
    drawingId: confirmed.drawingId,
    profession: confirmed.profession,
    symbolType: confirmed.symbolType,
    name,
    quantityValue: confirmed.quantityValue,
    now,
    takeoffItemId: evidenceRows[0]?.takeoffItemId ?? null,
  });

  if (updatedItem) {
    await upsertTakeoffItem(updatedItem);
  } else if (removeItemId) {
    await deleteTakeoffItem(projectId, removeItemId).catch(() => undefined);
  }

  await Promise.all(evidenceRows.map((e) => deleteTakeoffEvidence(projectId, e.id).catch(() => undefined)));

  await deleteConfirmedSymbol(projectId, confirmed.id);
  await deleteSymbolCandidate(projectId, candidateId).catch(() => undefined);

  return {
    removedTakeoffItemId: removeItemId,
    updatedTakeoffItemId: updatedItem?.id ?? null,
  };
}

/**
 * Drag-to-reposition on the plan — for a mis-placed mark (candidate OR
 * already-confirmed symbol). Only the overlay position changes: status,
 * quantity and evidence links are untouched. bbox_pdf is translated by the
 * same real-world delta (see translateBboxPdfForMove) so it stays
 * consistent with normalizedPosition regardless of which unit convention
 * it was originally stored in.
 */
export async function moveCandidateOrConfirmedSymbol(input: {
  projectId: string;
  candidateId: string;
  newNormalizedPosition: NormalizedRect;
  /** Pass the already-loaded DTO to skip a redundant Firestore read. */
  candidateDto?: AnalyzeRegionCandidateDto;
}): Promise<void> {
  const { projectId, candidateId, newNormalizedPosition } = input;
  const dto =
    input.candidateDto ??
    (await getSymbolCandidate(projectId, candidateId).then((c) =>
      c ? dtoFromSymbolCandidate(c) : null
    ));
  if (!dto) throw new Error("CANDIDATE_NOT_FOUND");

  const newBboxPdf = translateBboxPdfForMove(
    dto.bbox_pdf,
    dto.normalized_position,
    newNormalizedPosition
  );

  if (dto.status === "confirmed") {
    const confirmed = await getConfirmedSymbolByCandidateId(projectId, candidateId);
    if (!confirmed) throw new Error("CONFIRMED_SYMBOL_NOT_FOUND");
    await updateConfirmedSymbolPosition(projectId, confirmed.id, {
      normalizedPosition: newNormalizedPosition,
      bboxPdf: newBboxPdf,
    });
    return;
  }
  await updateSymbolCandidatePosition(projectId, candidateId, {
    normalizedPosition: newNormalizedPosition,
    bboxPdf: newBboxPdf,
  });
}

/**
 * Retype an already-CONFIRMED symbol (e.g. a wrongly detected "light" that
 * is actually a "switch"). Unlike changeSymbolCandidateType (which only
 * touches the candidate row before confirmation), this must move the
 * quantity from the old takeoff item bucket to the new one — otherwise the
 * takeoff report would keep counting it under the wrong symbol type
 * forever. The confirmedSymbol/evidence rows themselves are kept (never
 * deleted) so evidence stays traceable; only their symbolType + bucket
 * change.
 */
export async function changeConfirmedSymbolType(input: {
  projectId: string;
  candidateId: string;
  symbol_type: string;
}): Promise<{ confirmedSymbol: ConfirmedSymbol; takeoffItemId: string | null }> {
  const { projectId, candidateId, symbol_type: symbolType } = input;
  const confirmed = await getConfirmedSymbolByCandidateId(projectId, candidateId);
  if (!confirmed) throw new Error("CONFIRMED_SYMBOL_NOT_FOUND");

  const label = defaultLabelForSymbolType(symbolType);
  const now = new Date().toISOString();

  if (symbolType === confirmed.symbolType) {
    // Same type re-applied — still refresh the candidate's display label,
    // but there is no quantity to move.
    await updateSymbolCandidateStatus(projectId, candidateId, {
      labelSuggestions: [{ label, confidence: 1 }],
      symbolTypeHint: symbolType,
    });
    return { confirmedSymbol: confirmed, takeoffItemId: null };
  }

  const [items, evidenceRows, candidateRow] = await Promise.all([
    listTakeoffItems(projectId, confirmed.drawingId),
    listTakeoffEvidenceForConfirmedSymbol(projectId, confirmed.id),
    getSymbolCandidate(projectId, candidateId).catch(() => null),
  ]);
  const oldName =
    candidateRow?.labelSuggestions?.[0]?.label?.trim() ||
    defaultLabelForSymbolType(confirmed.symbolType);

  const { updatedItem: reducedItem, removeItemId } = applyUnconfirmToTakeoffItems({
    items,
    drawingId: confirmed.drawingId,
    profession: confirmed.profession,
    symbolType: confirmed.symbolType,
    name: oldName,
    quantityValue: confirmed.quantityValue,
    now,
    takeoffItemId: evidenceRows[0]?.takeoffItemId ?? null,
  });
  if (reducedItem) {
    await upsertTakeoffItem(reducedItem);
  } else if (removeItemId) {
    await deleteTakeoffItem(projectId, removeItemId).catch(() => undefined);
  }

  const itemsAfterRemoval = items
    .filter((i) => i.id !== removeItemId)
    .map((i) => (i.id === reducedItem?.id ? reducedItem : i));

  const { updatedItem: newItem } = applyConfirmToTakeoffItems({
    items: itemsAfterRemoval,
    projectId,
    drawingId: confirmed.drawingId,
    profession: confirmed.profession,
    symbolType,
    name: label,
    unit: confirmed.quantityUnit,
    quantityValue: confirmed.quantityValue,
    now,
    newItemId: newLocalId("titem"),
  });
  await upsertTakeoffItem(newItem);

  // Evidence follows the quantity into the new bucket — keeps counts traceable.
  await Promise.all(
    evidenceRows.map((e) =>
      updateTakeoffEvidenceItem(projectId, e.id, newItem.id).catch(() => undefined)
    )
  );

  await updateConfirmedSymbolType(projectId, confirmed.id, symbolType);
  await updateSymbolCandidateStatus(projectId, candidateId, {
    labelSuggestions: [{ label, confidence: 1 }],
    symbolTypeHint: symbolType,
  });

  return { confirmedSymbol: { ...confirmed, symbolType }, takeoffItemId: newItem.id };
}

/**
 * Move a CONFIRMED mark into a different category/position (e.g. a mark
 * counted under "Zásuvka" that is actually "Zásuvka 2x pod sebou"). Moves
 * exactly this mark's quantity from its current takeoff item to the target
 * position's item (created when missing), re-links its evidence, and
 * relabels the candidate so panel grouping and plan colors follow.
 * Also the batch primitive behind "rename category" (called per mark).
 */
export async function moveConfirmedSymbolToCategory(input: {
  projectId: string;
  candidateId: string;
  /** Target position name — its normalized form is the category key. */
  label: string;
  /** Optional new symbol type (kept unchanged when omitted). */
  symbol_type?: string;
}): Promise<{ takeoffItemId: string }> {
  const { projectId, candidateId } = input;
  const label = input.label.trim();
  if (!label) throw new Error("CATEGORY_LABEL_REQUIRED");

  const confirmed = await getConfirmedSymbolByCandidateId(projectId, candidateId);
  if (!confirmed) throw new Error("CONFIRMED_SYMBOL_NOT_FOUND");
  const symbolType = input.symbol_type?.trim() || confirmed.symbolType;
  const now = new Date().toISOString();

  const [items, evidenceRows, candidateRow] = await Promise.all([
    listTakeoffItems(projectId, confirmed.drawingId),
    listTakeoffEvidenceForConfirmedSymbol(projectId, confirmed.id),
    getSymbolCandidate(projectId, candidateId).catch(() => null),
  ]);
  const oldName =
    candidateRow?.labelSuggestions?.[0]?.label?.trim() ||
    defaultLabelForSymbolType(confirmed.symbolType);

  const { updatedItem: reducedItem, removeItemId } = applyUnconfirmToTakeoffItems({
    items,
    drawingId: confirmed.drawingId,
    profession: confirmed.profession,
    symbolType: confirmed.symbolType,
    name: oldName,
    quantityValue: confirmed.quantityValue,
    now,
    takeoffItemId: evidenceRows[0]?.takeoffItemId ?? null,
  });
  if (reducedItem) {
    await upsertTakeoffItem(reducedItem);
  } else if (removeItemId) {
    await deleteTakeoffItem(projectId, removeItemId).catch(() => undefined);
  }

  const itemsAfterRemoval = items
    .filter((i) => i.id !== removeItemId)
    .map((i) => (i.id === reducedItem?.id ? reducedItem : i));

  const { updatedItem: newItem } = applyConfirmToTakeoffItems({
    items: itemsAfterRemoval,
    projectId,
    drawingId: confirmed.drawingId,
    profession: confirmed.profession,
    symbolType,
    name: label,
    unit: confirmed.quantityUnit,
    quantityValue: confirmed.quantityValue,
    now,
    newItemId: newLocalId("titem"),
  });
  await upsertTakeoffItem(newItem);

  await Promise.all(
    evidenceRows.map((e) =>
      updateTakeoffEvidenceItem(projectId, e.id, newItem.id).catch(() => undefined)
    )
  );

  if (symbolType !== confirmed.symbolType) {
    await updateConfirmedSymbolType(projectId, confirmed.id, symbolType);
  }
  await updateSymbolCandidateStatus(projectId, candidateId, {
    labelSuggestions: [{ label, confidence: 1 }],
    symbolTypeHint: symbolType,
  });

  return { takeoffItemId: newItem.id };
}

export async function confirmAllProbableCandidates(input: {
  projectId: string;
  candidates: AnalyzeRegionCandidateDto[];
  create_template?: boolean;
  fileUrl?: string | null;
}): Promise<{ confirmed: number; failed: number }> {
  let confirmed = 0;
  let failed = 0;
  const probable = input.candidates.filter(
    (c) => c.status === "probable" || (c.status === "candidate" && c.confidence >= 0.55)
  );
  for (const c of probable) {
    try {
      await confirmSymbolCandidate({
        projectId: input.projectId,
        candidateId: c.id,
        candidateDto: c,
        create_template: input.create_template,
        fileUrl: input.fileUrl,
      });
      confirmed++;
    } catch {
      failed++;
    }
  }
  return { confirmed, failed };
}
