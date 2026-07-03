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
    s.roomsAndAreas.map((r) => ({
      name: r.roomName,
      areaM2: r.areaM2,
    }))
  );
  const dimensions = summaries.flatMap((s) =>
    s.dimensions.map((d) => ({ label: d.label, value: d.value }))
  );
  const totalKnownAreaM2 = rooms.reduce((sum, r) => sum + (r.areaM2 ?? 0), 0) || undefined;

  const materialSuggestions = [
    ...(draft.materialSuggestions ?? []),
    ...summaries.flatMap((s) =>
      s.detectedMaterials.map((m) => ({
        name: m.name,
        category: m.category ?? "general",
        quantity: m.quantity,
        unit: m.unit,
        confidence: m.confidence,
        source: "attachment" as const,
        sourceNote: m.sourceNote,
      }))
    ),
  ];

  const clarificationQuestions = [
    ...new Set([...(draft.clarificationQuestions ?? []), ...mergedQuestions]),
  ];

  return {
    ...draft,
    attachmentFindings: summaries,
    projectFacts: {
      ...(draft.projectFacts ?? {}),
      totalKnownAreaM2: draft.projectFacts?.totalKnownAreaM2 ?? totalKnownAreaM2,
      rooms: draft.projectFacts?.rooms?.length ? draft.projectFacts.rooms : rooms,
      dimensions: draft.projectFacts?.dimensions?.length ? draft.projectFacts.dimensions : dimensions,
    },
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
