import * as admin from "firebase-admin";
import type { Bucket } from "@google-cloud/storage";
import sharp from "sharp";
import type {
  AttachmentProcessing,
  ProcessedFileDiagnostic,
} from "./attachmentSummarySchema";

export type DraftFileRecord = {
  fileName: string;
  mimeType: string;
  storagePath: string;
  uploadedBy: string;
  workspaceId: string;
  uploadSessionId?: string;
  extractedText?: string;
  extractionStatus?: "ok" | "partial" | "unsupported" | "error";
  extractionNote?: string;
};

export type DraftFileCollectionResult = {
  files: DraftFileRecord[];
  attachmentProcessing: AttachmentProcessing;
};

export async function loadDraftFiles(
  db: admin.firestore.Firestore,
  storageKey: string,
  authUid: string,
  fileIds: string[] | undefined,
  diagnostics: ProcessedFileDiagnostic[]
): Promise<DraftFileRecord[]> {
  if (!fileIds?.length) return [];
  const ids = fileIds.filter((id) => id && !id.includes("/") && !id.startsWith("path:"));
  const snaps = await Promise.all(
    ids.map((id) => db.doc(`workspaces/${storageKey}/aiDraftFiles/${id}`).get())
  );

  const results: DraftFileRecord[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const snap = snaps[i]!;
    if (!snap.exists) {
      diagnostics.push({
        name: id,
        status: "skipped",
        reason: "Attachment record not found in workspace.",
      });
      continue;
    }
    const data = snap.data() as DraftFileRecord;
    if (data.uploadedBy !== authUid) {
      diagnostics.push({
        name: data.fileName ?? id,
        mimeType: data.mimeType,
        status: "skipped",
        reason: "Attachment does not belong to the authenticated user.",
      });
      continue;
    }
    if (data.workspaceId && data.workspaceId !== storageKey) {
      diagnostics.push({
        name: data.fileName ?? id,
        mimeType: data.mimeType,
        status: "skipped",
        reason: "Attachment belongs to a different workspace.",
      });
      continue;
    }
    if (!isAllowedDraftStoragePath(data.storagePath, authUid, storageKey)) {
      diagnostics.push({
        name: data.fileName ?? id,
        mimeType: data.mimeType,
        status: "skipped",
        reason: "Attachment storage path is not allowed for this workspace.",
      });
      continue;
    }
    results.push(data);
  }
  return results;
}

function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

export function isAllowedDraftStoragePath(
  storagePath: string,
  authUid: string,
  storageKey: string
): boolean {
  return (
    storagePath.startsWith(`users/${authUid}/aiProjectDrafts/`) ||
    storagePath.startsWith(`workspaces/${storageKey}/ai-drafts/`)
  );
}

export function loadDraftFilesFromStoragePaths(
  authUid: string,
  storageKey: string,
  paths: string[] | undefined,
  diagnostics: ProcessedFileDiagnostic[]
): DraftFileRecord[] {
  if (!paths?.length) return [];
  const seen = new Set<string>();
  const results: DraftFileRecord[] = [];
  for (const storagePath of paths) {
    const trimmed = storagePath.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;

    if (!isAllowedDraftStoragePath(trimmed, authUid, storageKey)) {
      const fileName = trimmed.split("/").pop() ?? trimmed;
      diagnostics.push({
        name: fileName,
        status: "skipped",
        reason: "Storage path is outside the allowed workspace scope.",
      });
      continue;
    }

    seen.add(trimmed);
    const fileName = trimmed.split("/").pop() ?? trimmed;
    results.push({
      fileName,
      mimeType: guessMimeType(fileName),
      storagePath: trimmed,
      uploadedBy: authUid,
      workspaceId: storageKey,
    });
  }
  return results;
}

function mergeDraftFilesByPath(...groups: DraftFileRecord[][]): DraftFileRecord[] {
  const byPath = new Map<string, DraftFileRecord>();
  for (const group of groups) {
    for (const file of group) {
      if (!byPath.has(file.storagePath)) {
        byPath.set(file.storagePath, file);
      }
    }
  }
  return [...byPath.values()];
}

export async function collectDraftFilesForGeneration(params: {
  db: admin.firestore.Firestore;
  storageKey: string;
  authUid: string;
  attachedFileIds?: string[];
  documentStoragePaths?: string[];
}): Promise<DraftFileCollectionResult> {
  const processedFiles: ProcessedFileDiagnostic[] = [];
  const uploadedFileCount =
    (params.attachedFileIds?.filter((id) => id && !id.startsWith("path:")).length ?? 0) +
    (params.documentStoragePaths?.length ?? 0);

  const fromIds = await loadDraftFiles(
    params.db,
    params.storageKey,
    params.authUid,
    params.attachedFileIds,
    processedFiles
  );
  const fromPaths = loadDraftFilesFromStoragePaths(
    params.authUid,
    params.storageKey,
    params.documentStoragePaths,
    processedFiles
  );
  const files = mergeDraftFilesByPath(fromIds, fromPaths);

  const skippedFileCount = processedFiles.filter((f) => f.status === "skipped").length;

  return {
    files,
    attachmentProcessing: {
      uploadedFileCount,
      processedFileCount: 0,
      skippedFileCount,
      processedFiles,
      warnings: processedFiles
        .filter((f) => f.status === "skipped" && f.reason)
        .map((f) => `${f.name}: ${f.reason}`),
    },
  };
}

const MAX_INLINE_ATTACHMENT_BYTES = 7 * 1024 * 1024;
const VISION_MAX_EDGE_PX = 1600;

export function isVisualAttachmentMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return m.startsWith("image/") || m === "application/pdf";
}

async function optimizeVisualBytes(
  bytes: Buffer,
  mime: string
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (!mime.startsWith("image/")) {
    return { bytes, mimeType: mime };
  }
  try {
    const optimized = await sharp(bytes)
      .rotate()
      .resize(VISION_MAX_EDGE_PX, VISION_MAX_EDGE_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (optimized.length >= bytes.length) {
      return { bytes, mimeType: mime };
    }
    return { bytes: optimized, mimeType: "image/jpeg" };
  } catch {
    return { bytes, mimeType: mime };
  }
}

export async function loadVisualAttachment(
  bucket: Bucket,
  file: DraftFileRecord
): Promise<{ fileName: string; mimeType: string; bytes: Buffer } | null> {
  const mime = file.mimeType?.toLowerCase() ?? "";
  if (!isVisualAttachmentMime(mime)) return null;
  try {
    const [buf] = await bucket.file(file.storagePath).download();
    const { bytes, mimeType } = await optimizeVisualBytes(buf, mime);
    if (bytes.length > MAX_INLINE_ATTACHMENT_BYTES) return null;
    return { fileName: file.fileName, mimeType, bytes };
  } catch {
    return null;
  }
}

export async function extractFileText(
  bucket: Bucket,
  file: DraftFileRecord
): Promise<{ text: string; status: DraftFileRecord["extractionStatus"]; note?: string }> {
  const mime = file.mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("text/") || mime === "application/json" || file.fileName.endsWith(".txt")) {
    try {
      const [buf] = await bucket.file(file.storagePath).download();
      return { text: buf.toString("utf8").slice(0, 50000), status: "ok" };
    } catch {
      return { text: "", status: "error", note: "Could not read text file." };
    }
  }

  if (mime.includes("wordprocessingml")) {
    return {
      text: "",
      status: "unsupported",
      note: "DOCX text extraction is not yet enabled server-side; file attached as reference.",
    };
  }

  return { text: "", status: "unsupported", note: "Unsupported file type for text extraction." };
}

export function markFileDiagnostic(
  diagnostics: ProcessedFileDiagnostic[],
  file: DraftFileRecord,
  patch: Partial<ProcessedFileDiagnostic> & { status: ProcessedFileDiagnostic["status"] }
): void {
  const existing = diagnostics.find(
    (d) => d.name === file.fileName || d.name === file.storagePath
  );
  if (existing) {
    Object.assign(existing, patch, { name: file.fileName, mimeType: file.mimeType });
    return;
  }
  diagnostics.push({
    name: file.fileName,
    mimeType: file.mimeType,
    ...patch,
  });
}
