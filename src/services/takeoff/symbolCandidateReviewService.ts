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
  defaultLabelForSymbolType,
  defaultSymbolTypeForCandidate,
  dtoFromSymbolCandidate,
  findDuplicateConfirmedSymbol,
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
  getSymbolCandidate,
  listConfirmedSymbolsForPage,
  listTakeoffEvidenceForConfirmedSymbol,
  listTakeoffItems,
  updateSymbolCandidateStatus,
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

export async function confirmSymbolCandidate(
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
