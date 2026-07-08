import { ATTACHMENT_SIZE_POLICY, type PreparedAttachment } from "@/lib/attachmentSizePolicy";
import { compressImageForAiUpload } from "@/lib/compressAiUploadImage";

function warnCategory(file: File): PreparedAttachment["warnLarge"] | undefined {
  const mime = (file.type || "").toLowerCase();
  const { image, pdf, document } = ATTACHMENT_SIZE_POLICY;

  if (mime.startsWith("image/") && file.size > image.warnAboveBytes) return "image";
  if (mime === "application/pdf" && file.size > pdf.warnAboveBytes) return "pdf";
  if (
    (mime === "text/plain" ||
      mime.includes("wordprocessingml") ||
      file.name.endsWith(".docx") ||
      file.name.endsWith(".txt")) &&
    file.size > document.warnAboveBytes
  ) {
    return "document";
  }
  return undefined;
}

/**
 * Normalize attachments before Storage upload: compress photos, pass PDFs through.
 */
export async function prepareProjectAttachmentFile(file: File): Promise<PreparedAttachment> {
  if (file.size > ATTACHMENT_SIZE_POLICY.maxUploadBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) {
    const before = file.size;
    const compressed = await compressImageForAiUpload(file);
    return {
      file: compressed,
      optimized: compressed.size < before || compressed.name !== file.name,
      warnLarge: warnCategory(compressed),
    };
  }

  return {
    file,
    optimized: false,
    warnLarge: warnCategory(file),
  };
}
