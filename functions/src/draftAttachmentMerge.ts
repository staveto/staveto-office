import type { AttachmentSummary } from "./attachmentSummarySchema";
import { deriveExtractedSignals } from "./attachmentSummarySchema";
import type { ProjectDraftPayload } from "./draftSchema";
import type { DraftFileRecord } from "./files";
import { markFileDiagnostic } from "./files";
import type { ProcessedFileDiagnostic } from "./attachmentSummarySchema";
import { mergeAttachmentMissingQuestions } from "./attachmentPrompt";

export function enrichDraftWithAttachmentFindings(
  draft: ProjectDraftPayload,
  summaries: AttachmentSummary[]
): ProjectDraftPayload {
  if (summaries.length === 0) return draft;

  const mergedQuestions = mergeAttachmentMissingQuestions(summaries);
  const rooms = summaries.flatMap((s) =>
    s.roomsAndAreas.map((r) => {
      const room: { name: string; areaM2?: number } = { name: r.roomName };
      if (typeof r.areaM2 === "number" && Number.isFinite(r.areaM2)) {
        room.areaM2 = r.areaM2;
      }
      return room;
    })
  );
  const dimensions = summaries.flatMap((s) =>
    s.dimensions.map((d) => ({ label: d.label, value: d.value }))
  );
  const areaSum = rooms.reduce((sum, r) => sum + (r.areaM2 ?? 0), 0);
  const totalKnownAreaM2 = areaSum > 0 ? areaSum : undefined;

  const materialSuggestions = [
    ...(draft.materialSuggestions ?? []),
    ...summaries.flatMap((s) =>
      s.detectedMaterials.map((m) => {
        const row: {
          name: string;
          category: string;
          quantity?: number;
          unit?: string;
          confidence: typeof m.confidence;
          source: "attachment";
          sourceNote?: string;
        } = {
          name: m.name,
          category: m.category ?? "general",
          confidence: m.confidence,
          source: "attachment",
        };
        if (typeof m.quantity === "number" && Number.isFinite(m.quantity)) {
          row.quantity = m.quantity;
        }
        if (m.unit) row.unit = m.unit;
        if (m.sourceNote) row.sourceNote = m.sourceNote;
        return row;
      })
    ),
  ];

  const clarificationQuestions = [
    ...new Set([...(draft.clarificationQuestions ?? []), ...mergedQuestions]),
  ];

  const projectFacts: NonNullable<ProjectDraftPayload["projectFacts"]> = {
    ...(draft.projectFacts ?? {}),
  };
  const knownArea = draft.projectFacts?.totalKnownAreaM2 ?? totalKnownAreaM2;
  if (typeof knownArea === "number" && Number.isFinite(knownArea)) {
    projectFacts.totalKnownAreaM2 = knownArea;
  } else {
    delete projectFacts.totalKnownAreaM2;
  }
  projectFacts.rooms = draft.projectFacts?.rooms?.length ? draft.projectFacts.rooms : rooms;
  projectFacts.dimensions = draft.projectFacts?.dimensions?.length
    ? draft.projectFacts.dimensions
    : dimensions;

  return {
    ...draft,
    attachmentFindings: summaries,
    projectFacts,
    materialSuggestions: materialSuggestions.length ? materialSuggestions : draft.materialSuggestions,
    missingQuestions: mergedQuestions.length ? mergedQuestions : draft.missingQuestions,
    clarificationQuestions,
  };
}

export function recordAttachmentSummaryDiagnostic(
  diagnostics: ProcessedFileDiagnostic[],
  file: DraftFileRecord,
  summary: AttachmentSummary
): void {
  markFileDiagnostic(diagnostics, file, {
    status: "processed",
    extractedSignals: deriveExtractedSignals(summary),
  });
}

export function recordAttachmentFailureDiagnostic(
  diagnostics: ProcessedFileDiagnostic[],
  file: DraftFileRecord,
  reason: string
): void {
  markFileDiagnostic(diagnostics, file, {
    status: "failed",
    reason,
  });
}

export function recordAttachmentSkippedDiagnostic(
  diagnostics: ProcessedFileDiagnostic[],
  file: DraftFileRecord,
  reason: string
): void {
  markFileDiagnostic(diagnostics, file, {
    status: "skipped",
    reason,
  });
}

export function finalizeAttachmentProcessing(
  base: {
    uploadedFileCount: number;
    processedFileCount: number;
    skippedFileCount: number;
    processedFiles: ProcessedFileDiagnostic[];
    warnings: string[];
  },
  extraWarnings: string[]
): {
  uploadedFileCount: number;
  processedFileCount: number;
  skippedFileCount: number;
  processedFiles: ProcessedFileDiagnostic[];
  warnings: string[];
} {
  const processedFileCount = base.processedFiles.filter((f) => f.status === "processed").length;
  const skippedFileCount = base.processedFiles.filter(
    (f) => f.status === "skipped" || f.status === "failed"
  ).length;
  const warnings = [...new Set([...base.warnings, ...extraWarnings])];
  return {
    ...base,
    processedFileCount,
    skippedFileCount,
    warnings,
  };
}
