export const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const COMPANY_LOGO_MAX_EDGE_PX = 1024;

const LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

export type PrepareCompanyLogoResult = {
  file: File;
  optimized: boolean;
};

function resolveLogoMimeType(file: File): string | null {
  const type = file.type?.trim().toLowerCase();
  if (type && LOGO_MIME_TYPES.has(type)) return type;

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return type || null;
}

function browserSupportsWebp(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type DrawableSource = ImageBitmap | HTMLImageElement;

function sourceWidth(source: DrawableSource): number {
  return source.width;
}

function sourceHeight(source: DrawableSource): number {
  return source.height;
}

async function loadDrawableSource(file: File): Promise<DrawableSource> {
  try {
    return await createImageBitmap(file);
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("COMPANY_PROFILE_LOGO_UNSUPPORTED"));
      };
      img.src = url;
    });
  }
}

function closeDrawableSource(source: DrawableSource): void {
  if ("close" in source && typeof source.close === "function") {
    source.close();
  }
}

async function renderLogoBlob(
  source: DrawableSource,
  width: number,
  height: number,
  mime: "image/webp" | "image/jpeg",
  quality: number
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

async function compressDrawableLogo(
  file: File,
  source: DrawableSource
): Promise<File> {
  const outputMime: "image/webp" | "image/jpeg" = browserSupportsWebp()
    ? "image/webp"
    : "image/jpeg";
  const ext = outputMime === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "logo";
  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.34];
  const srcW = sourceWidth(source);
  const srcH = sourceHeight(source);

  let maxEdge = COMPANY_LOGO_MAX_EDGE_PX;
  while (maxEdge >= 320) {
    const { width, height } = scaledDimensions(srcW, srcH, maxEdge);
    for (const quality of qualities) {
      const blob = await renderLogoBlob(source, width, height, outputMime, quality);
      if (blob && blob.size <= COMPANY_LOGO_MAX_BYTES) {
        return new File([blob], `${baseName}.${ext}`, { type: outputMime });
      }
    }
    maxEdge = Math.round(maxEdge * 0.8);
  }

  throw new Error("COMPANY_PROFILE_LOGO_TOO_LARGE");
}

/**
 * Shrinks oversized raster/SVG logos client-side before upload (max 2 MB).
 */
export async function prepareCompanyLogoFile(
  file: File
): Promise<PrepareCompanyLogoResult> {
  const mimeType = resolveLogoMimeType(file);
  if (!mimeType || !LOGO_MIME_TYPES.has(mimeType)) {
    throw new Error("COMPANY_PROFILE_LOGO_UNSUPPORTED");
  }

  if (file.size <= COMPANY_LOGO_MAX_BYTES) {
    return { file, optimized: false };
  }

  let source: DrawableSource | null = null;
  try {
    source = await loadDrawableSource(file);
    const compressed = await compressDrawableLogo(file, source);
    return { file: compressed, optimized: true };
  } finally {
    if (source) closeDrawableSource(source);
  }
}
