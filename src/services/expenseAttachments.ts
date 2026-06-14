/**
 * Upload an invoice file (image / PDF) to Firebase Storage so the OCR Cloud
 * Function can read it. We upload to `projects/{projectId}/documents/{fileName}`
 * (a single path segment), which the web Storage rules already permit for
 * signed-in users up to 25 MB. The OCR function reads the file via the Admin SDK,
 * so the exact path does not need to match the mobile `attachments/` convention.
 */
import {
  getStorageInstance,
  ref,
  uploadBytes,
  getDownloadURL,
} from "@/lib/firebase";

export const MAX_INVOICE_FILE_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_INVOICE_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export type UploadedInvoice = {
  storagePath: string;
  mimeType: string;
  downloadURL: string;
  fileName: string;
};

function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  return `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext || "bin"}`;
}

function normalizeMime(file: File): string {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/") || t === "application/pdf") {
    return t === "image/jpg" ? "image/jpeg" : t;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  return "application/octet-stream";
}

/**
 * Validate + upload the file. Throws coded Errors:
 * - `FILE_TOO_LARGE`
 * - `UNSUPPORTED_TYPE`
 * - `STORAGE_UNAVAILABLE`
 * - `UPLOAD_FAILED`
 */
export async function uploadInvoiceForOcr(
  projectId: string,
  file: File
): Promise<UploadedInvoice> {
  if (!projectId) throw new Error("UPLOAD_FAILED");
  if (file.size > MAX_INVOICE_FILE_BYTES) throw new Error("FILE_TOO_LARGE");

  const mimeType = normalizeMime(file);
  if (!ACCEPTED_INVOICE_MIME.includes(mimeType)) {
    throw new Error("UNSUPPORTED_TYPE");
  }

  const storage = getStorageInstance();
  if (!storage) throw new Error("STORAGE_UNAVAILABLE");

  const fileName = sanitizeFileName(file.name || "invoice");
  const storagePath = `projects/${projectId}/documents/${fileName}`;

  try {
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file, { contentType: mimeType });
    const downloadURL = await getDownloadURL(storageRef);
    return { storagePath, mimeType, downloadURL, fileName };
  } catch {
    throw new Error("UPLOAD_FAILED");
  }
}
