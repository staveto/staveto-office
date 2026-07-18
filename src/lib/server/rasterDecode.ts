/**
 * Server-side PNG/JPEG → RGBA raster decoding via sharp (Node runtime only).
 * Shared by takeoff API routes (analyze-region, find-similar).
 */

import type { RasterImage } from "@/lib/ai/visualSymbolCounter";

export async function decodePngOrJpegToRgba(
  base64: string
): Promise<RasterImage | null> {
  try {
    // sharp is optional at build time; dynamic import keeps routes lean when unused.
    const sharp = (await import("sharp")).default;
    const buf = Buffer.from(base64, "base64");
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels < 3) return null;
    let rgba: Uint8ClampedArray;
    if (info.channels === 4) {
      rgba = new Uint8ClampedArray(data);
    } else {
      rgba = new Uint8ClampedArray(info.width * info.height * 4);
      for (let i = 0, j = 0; i < info.width * info.height; i++, j += info.channels) {
        const o = i * 4;
        rgba[o] = data[j] ?? 0;
        rgba[o + 1] = data[j + 1] ?? 0;
        rgba[o + 2] = data[j + 2] ?? 0;
        rgba[o + 3] = 255;
      }
    }
    return { width: info.width, height: info.height, data: rgba };
  } catch {
    return null;
  }
}
