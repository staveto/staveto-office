import { createHash } from "node:crypto";
import { normalizeSupplierSku } from "../normalize";

/** Stable product id: buco_<sku> or buco_url_<hash>. */
export function buildBucoProductId(sku: string | null | undefined, sourceUrl: string): string {
  const normalized = normalizeSupplierSku(sku ?? undefined);
  if (normalized) return `buco_${normalized.toLowerCase()}`;
  const hash = createHash("sha1").update(sourceUrl.trim()).digest("hex").slice(0, 16);
  return `buco_url_${hash}`;
}

export function buildImportId(prefix = "buco_electrical"): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${prefix}_${stamp}`;
}
