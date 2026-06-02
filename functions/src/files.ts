import * as admin from "firebase-admin";
import type { Bucket } from "@google-cloud/storage";

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
  const results: DraftFileRecord[] = [];
  for (const id of fileIds) {
    const snap = await db.doc(`workspaces/${storageKey}/aiDraftFiles/${id}`).get();
    if (snap.exists) {
      results.push(snap.data() as DraftFileRecord);
    }
  }
  return results;
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

  if (mime === "application/pdf" || mime.includes("wordprocessingml")) {
    return {
      text: "",
      status: "unsupported",
      note: "PDF/DOCX text extraction is not yet enabled server-side; file attached as reference.",
    };
  }

  if (mime.startsWith("image/")) {
    return {
      text: "",
      status: "partial",
      note: "Image stored; describe visuals in user text or enable vision in a later release.",
    };
  }

  return { text: "", status: "unsupported", note: "Unsupported file type for text extraction." };
}
