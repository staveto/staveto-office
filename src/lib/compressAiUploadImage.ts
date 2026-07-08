import { ATTACHMENT_SIZE_POLICY } from "@/lib/attachmentSizePolicy";

const MAX_EDGE_PX = ATTACHMENT_SIZE_POLICY.image.maxEdgePx;
const JPEG_QUALITY = ATTACHMENT_SIZE_POLICY.image.jpegQuality;
const SKIP_BELOW_BYTES = ATTACHMENT_SIZE_POLICY.image.skipBelowBytes;

/** Resize large photos before AI upload — faster upload + vision on server. */
export async function compressImageForAiUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }
  if (file.size <= SKIP_BELOW_BYTES) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.type === "image/jpeg" && file.size <= SKIP_BELOW_BYTES * 2) {
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
