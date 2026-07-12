import { getStorageInstance, ref, getDownloadURL } from "@/lib/firebase";
import type { UploadedAiDraftFile } from "@/services/ai/aiDraftFiles";

/** Open an AI draft attachment in a new tab (PDF / image preview). */
export async function resolveAiDraftAttachmentUrl(
  file: Pick<UploadedAiDraftFile, "storagePath">
): Promise<string | null> {
  const storagePath = file.storagePath?.trim();
  if (!storagePath) return null;
  const storage = getStorageInstance();
  if (!storage) return null;
  try {
    return await getDownloadURL(ref(storage, storagePath));
  } catch {
    return null;
  }
}

export async function openAiDraftAttachment(
  file: Pick<UploadedAiDraftFile, "storagePath" | "fileName">
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = await resolveAiDraftAttachmentUrl(file);
  if (!url) {
    return {
      ok: false,
      error: "Súbor sa nepodarilo otvoriť. Skúste znova alebo nahrajte podklad znova.",
    };
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true };
}
