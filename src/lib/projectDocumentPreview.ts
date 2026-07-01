import { getStorageInstance, ref, getDownloadURL } from "@/lib/firebase";
import type { ProjectDocumentRecord } from "@/services/projects/projectDocuments";

export type ProjectDocumentPreviewKind = "image" | "pdf" | "text" | "unsupported";

export function getProjectDocumentPreviewKind(
  mimeType: string | undefined | null
): ProjectDocumentPreviewKind {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/plain") return "text";
  return "unsupported";
}

export async function resolveProjectDocumentUrl(
  doc: Pick<ProjectDocumentRecord, "storagePath">
): Promise<string | null> {
  if (!doc.storagePath?.trim()) return null;
  const storage = getStorageInstance();
  if (!storage) return null;
  try {
    return await getDownloadURL(ref(storage, doc.storagePath));
  } catch {
    return null;
  }
}
