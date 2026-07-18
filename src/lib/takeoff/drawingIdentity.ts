/**
 * Canonical drawing identity — pure precedence rule.
 *
 * The takeoff data model (symbolCandidates, confirmedSymbols, takeoffItems,
 * takeoffEvidence, drawingRegions) is keyed by a single `drawingId` field
 * under projects/{projectId}/... . Two different UI flows can reach the
 * SAME physical PDF with different natural ids:
 *  - Project Documents / /takeoff → projects/{projectId}/documents/{id}
 *  - Quote AI-setup flow → an AI draft file id (workspaces/{ws}/aiDraftFiles/{id})
 *
 * A real Firestore project-document id is always preferred — it is the
 * durable identity a PDF gets once it lives in "Documents". Callers that
 * can resolve a documentId (directly, or via drawingIdentityService for the
 * quote flow) MUST pass it here so every flow ends up with the same id.
 *
 * This helper never touches Firestore — see drawingIdentityService.ts for
 * the async lookup that can discover a documentId from an AI draft file.
 */

export type CanonicalDrawingIdInput = {
  projectId: string;
  documentId?: string | null;
  quoteId?: string | null;
  fileId?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
};

/**
 * Precedence: real project document id > AI draft/file id > file name > a
 * stable fallback. `quoteId`/`fileUrl` never determine identity on their
 * own (a quote can reference many drawings; a URL can expire/rotate).
 */
export function getCanonicalDrawingId(input: CanonicalDrawingIdInput): string {
  const documentId = input.documentId?.trim();
  if (documentId) return documentId;
  const fileId = input.fileId?.trim();
  if (fileId) return fileId;
  const fileName = input.fileName?.trim();
  if (fileName) return fileName;
  return "drawing";
}
