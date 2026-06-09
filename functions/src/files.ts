import * as admin from "firebase-admin";
import type { Bucket } from "@google-cloud/storage";
import sharp from "sharp";

export type DraftFileRecord = {
  fileName: string;
  mimeType: string;
  storagePath: string;
  uploadedBy: string;
  workspaceId: string;
  extractedText?: string;
  extractionStatus?: "ok" | "partial" | "unsupported" | "error";
  extractionNote?: string;
};

export async function loadDraftFiles(
  db: admin.firestore.Firestore,
  storageKey: string,
  fileIds: string[] | undefined
): Promise<DraftFileRecord[]> {
  if (!fileIds?.length) return [];
  const ids = fileIds.filter((id) => id && !id.includes("/"));
  const snaps = await Promise.all(
    ids.map((id) => db.doc(`workspaces/${storageKey}/aiDraftFiles/${id}`).get())
  );
  return snaps
    .filter((snap) => snap.exists)
    .map((snap) => snap.data() as DraftFileRecord);
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
  paths: string[] | undefined
): DraftFileRecord[] {
  if (!paths?.length) return [];
  const seen = new Set<string>();
  const results: DraftFileRecord[] = [];
  for (const storagePath of paths) {
    const trimmed = storagePath.trim();
    if (!trimmed || seen.has(trimmed) || !isAllowedDraftStoragePath(trimmed, authUid, storageKey)) {
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
}): Promise<DraftFileRecord[]> {
  const fromIds = await loadDraftFiles(params.db, params.storageKey, params.attachedFileIds);
  const fromPaths = loadDraftFilesFromStoragePaths(
    params.authUid,
    params.storageKey,
    params.documentStoragePaths
  );
  return mergeDraftFilesByPath(fromIds, fromPaths);
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
