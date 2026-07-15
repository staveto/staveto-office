/**
 * Map uploaded AI wizard attachments to EstimatorDocument records.
 */

import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";
import type {
  EstimatorDocument,
  EstimatorDocumentRole,
  EstimatorPositionTrade,
  PdfOverlayAnnotation,
  EstimatorPosition,
} from "@/types/estimatorPositions";

export function inferDocumentRole(file: Pick<UploadedAiDraftFile, "fileName" | "mimeType">): EstimatorDocumentRole {
  const name = file.fileName.toLowerCase();
  const mime = (file.mimeType ?? "").toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) {
    if (/legend|legenda/i.test(name)) return "legend";
    if (/vykaz|výkaz|vypis|schedule|zoznam|tabulk/i.test(name)) return "schedule";
    if (/sprava|správa|report|technick/i.test(name)) return "technical_report";
    return "drawing";
  }
  if (
    mime.includes("csv") ||
    mime.includes("spreadsheet") ||
    name.endsWith(".csv") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    if (/cennik|cenník|pricebook|cenik/i.test(name)) return "pricebook";
    return "schedule";
  }
  if (mime.startsWith("image/")) return "photo";
  return "other";
}

export function buildEstimatorDocumentsFromAttachments(
  attachments: UploadedAiDraftFile[],
  urlByFileId: Map<string, string>
): EstimatorDocument[] {
  return attachments.map((file) => {
    const role = inferDocumentRole(file);
    return {
      id: `doc_${file.id}`,
      fileId: file.id,
      fileName: file.fileName,
      fileUrl: urlByFileId.get(file.id),
      mimeType: file.mimeType || "application/octet-stream",
      role,
      trades: ["electrical"] as EstimatorPositionTrade[],
      documentTypes: [role],
      status: "uploaded" as const,
      confidence: "medium" as const,
    };
  });
}

/** Prefer first drawing PDF for the interactive viewer; fallback to any PDF. */
export function pickDefaultDrawingDocument(documents: EstimatorDocument[]): EstimatorDocument | null {
  const drawing =
    documents.find((d) => d.role === "drawing" && d.mimeType.includes("pdf")) ??
    documents.find((d) => d.fileName.toLowerCase().endsWith(".pdf"));
  return drawing ?? documents[0] ?? null;
}

/** Viewer-ready PDF documents only. */
export function pdfDocuments(documents: EstimatorDocument[]): EstimatorDocument[] {
  return documents.filter(
    (d) =>
      d.mimeType.includes("pdf") ||
      d.fileName.toLowerCase().endsWith(".pdf")
  );
}

export function filterAnnotationsForDocument(
  annotations: PdfOverlayAnnotation[],
  positions: EstimatorPosition[],
  activeDocument: EstimatorDocument | null
): PdfOverlayAnnotation[] {
  if (!activeDocument) return annotations;

  const anchorIds = new Set<string>();
  for (const p of positions) {
    for (const a of p.evidenceAnchors) {
      if (
        a.documentId === activeDocument.id ||
        a.fileName === activeDocument.fileName ||
        (a.fileId && a.fileId === activeDocument.fileId)
      ) {
        anchorIds.add(a.id);
      }
    }
  }
  return annotations.filter((ann) => anchorIds.has(ann.evidenceAnchorId));
}

/** Merge persisted documents with freshly resolved URLs (additive). */
export function hydrateEstimatorDocuments(
  stored: EstimatorDocument[] | undefined,
  built: EstimatorDocument[]
): EstimatorDocument[] {
  if (!stored?.length) return built;
  const builtById = new Map(built.map((d) => [d.id, d]));
  const builtByFileId = new Map(built.map((d) => [d.fileId, d]));
  const merged = stored.map((d) => {
    const fresh = builtById.get(d.id) ?? builtByFileId.get(d.fileId);
    return fresh ? { ...d, fileUrl: fresh.fileUrl ?? d.fileUrl } : d;
  });
  const knownIds = new Set(merged.map((d) => d.id));
  const knownFileIds = new Set(merged.map((d) => d.fileId));
  const added = built.filter(
    (d) => !knownIds.has(d.id) && !knownFileIds.has(d.fileId)
  );
  return [...merged, ...added];
}
