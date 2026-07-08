import { getCallable, getStorageInstance, ref, getDownloadURL } from "@/lib/firebase";
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

function needsServerSignedUrl(storagePath: string): boolean {
  return (
    storagePath.includes("/ai-drafts/") ||
    storagePath.includes("/aiProjectDrafts/") ||
    storagePath.startsWith("users/")
  );
}

async function fetchSignedProjectDocumentUrl(
  projectId: string,
  storagePath: string
): Promise<string | null> {
  try {
    const callable = getCallable<
      { projectId: string; storagePath: string },
      { url: string }
    >("getProjectDocumentDownloadUrl", { timeoutMs: 30_000 });
    const res = await callable({ projectId, storagePath });
    return res.data?.url ?? null;
  } catch {
    return null;
  }
}

export async function resolveProjectDocumentUrl(
  doc: Pick<ProjectDocumentRecord, "storagePath" | "projectId">
): Promise<string | null> {
  const storagePath = doc.storagePath?.trim();
  if (!storagePath) return null;

  if (doc.projectId && needsServerSignedUrl(storagePath)) {
    const signed = await fetchSignedProjectDocumentUrl(doc.projectId, storagePath);
    if (signed) return signed;
  }

  const storage = getStorageInstance();
  if (!storage) return null;
  try {
    return await getDownloadURL(ref(storage, storagePath));
  } catch {
    if (doc.projectId) {
      return fetchSignedProjectDocumentUrl(doc.projectId, storagePath);
    }
    return null;
  }
}
