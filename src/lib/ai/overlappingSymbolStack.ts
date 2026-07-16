import type { NearbySymbolCandidate } from "@/lib/ai/pickSymbolFromClick";

/** True when 2+ full marks sit on top of each other (stack / dense cluster). */
export function isOverlappingStack(candidates: NearbySymbolCandidate[]): boolean {
  const full = candidates.filter((c) => !c.partOnly);
  if (full.length < 2) return false;
  for (let i = 0; i < full.length; i++) {
    for (let j = i + 1; j < full.length; j++) {
      const a = full[i]!;
      const b = full[j]!;
      const acx = (a.pixelBbox.minX + a.pixelBbox.maxX) / 2;
      const acy = (a.pixelBbox.minY + a.pixelBbox.maxY) / 2;
      const bcx = (b.pixelBbox.minX + b.pixelBbox.maxX) / 2;
      const bcy = (b.pixelBbox.minY + b.pixelBbox.maxY) / 2;
      const dist = Math.hypot(acx - bcx, acy - bcy);
      const aw = a.pixelBbox.maxX - a.pixelBbox.minX + 1;
      const ah = a.pixelBbox.maxY - a.pixelBbox.minY + 1;
      const bw = b.pixelBbox.maxX - b.pixelBbox.minX + 1;
      const bh = b.pixelBbox.maxY - b.pixelBbox.minY + 1;
      const near = dist < Math.max(aw, ah, bw, bh) * 0.85;
      const overlapX =
        Math.min(a.pixelBbox.maxX, b.pixelBbox.maxX) -
        Math.max(a.pixelBbox.minX, b.pixelBbox.minX);
      const overlapY =
        Math.min(a.pixelBbox.maxY, b.pixelBbox.maxY) -
        Math.max(a.pixelBbox.minY, b.pixelBbox.minY);
      if (near || (overlapX > 0 && overlapY > 0)) return true;
    }
  }
  return false;
}
