/** Mirror of src/lib/ai/materialQuantityFromFacts.ts for Cloud Functions. */

import { parseAreaM2FromText } from "./localizedNumber";

export type ProjectFactsLike = {
  buildingType?: string;
  totalKnownAreaM2?: number;
  rooms?: { name: string; areaM2?: number }[];
  dimensions?: { label: string; value: string }[];
};

export type AttachmentFindingLike = {
  detectedMaterials?: {
    name: string;
    quantity?: number;
    unit?: string;
    confidence?: string;
    sourceNote?: string;
  }[];
  roomsAndAreas?: { roomName: string; areaM2?: number }[];
  dimensions?: { label: string; value: string }[];
};

export type MaterialQuantityHint = {
  quantity: number;
  unit: string;
  sourceNote: string;
  confidence: "low" | "medium" | "high";
};

const FLOOR_RE =
  /podlah|floor|boden|dlážk|dlazk|parket|laminát|laminat|vinyl|koberec|terasov|obklad.*podlah/i;
const ROOF_RE = /streš|stres|roof|dach|krytin|šindl|bitumen/i;
const FACADE_RE = /fasád|fasad|facade|vonkajš|exterior.*plaster|außenputz/i;
const INTERIOR_PLASTER_RE = /vnútorn.*omietk|interior.*plaster|innenputz|vnútor.*omietk/i;
const PLASTER_RE = /omietk|plaster|putz/i;
const INSULATION_RE = /izol|insul|dämm|tepeln/i;

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseAreaFromText(text: string): number | null {
  const n = parseAreaM2FromText(text);
  return n === undefined ? null : n;
}

function parseDimensionArea(label: string, value: string): number | null {
  const fromValue = parseAreaM2FromText(value);
  if (fromValue !== undefined) return fromValue;
  const fromCombined = parseAreaM2FromText(`${label} ${value}`);
  return fromCombined === undefined ? null : fromCombined;
}

export function sumFloorAreaM2(
  facts?: ProjectFactsLike | null,
  findings?: AttachmentFindingLike[] | null
): number | null {
  const roomAreas: number[] = [];

  for (const room of facts?.rooms ?? []) {
    if (room.areaM2 && room.areaM2 > 0) roomAreas.push(room.areaM2);
  }

  for (const finding of findings ?? []) {
    for (const room of finding.roomsAndAreas ?? []) {
      if (room.areaM2 && room.areaM2 > 0) roomAreas.push(room.areaM2);
    }
  }

  if (roomAreas.length > 0) {
    return roundQty(roomAreas.reduce((sum, a) => sum + a, 0));
  }

  if (facts?.totalKnownAreaM2 && facts.totalKnownAreaM2 > 0) {
    return roundQty(facts.totalKnownAreaM2);
  }

  for (const dim of facts?.dimensions ?? []) {
    const area = parseDimensionArea(dim.label, dim.value);
    if (area) return area;
  }

  for (const finding of findings ?? []) {
    for (const dim of finding.dimensions ?? []) {
      const area = parseDimensionArea(dim.label, dim.value);
      if (area) return area;
    }
  }

  return null;
}

export function estimateFacadeAreaM2(footprintM2: number): number {
  if (footprintM2 <= 0) return 0;
  const side = Math.sqrt(footprintM2);
  const perimeter = 4 * side;
  const wallHeight = 2.8;
  return roundQty(perimeter * wallHeight * 0.85);
}

export function estimateInteriorWallAreaM2(floorAreaM2: number): number {
  if (floorAreaM2 <= 0) return 0;
  return roundQty(floorAreaM2 * 2.4);
}

function attachmentMaterialHint(
  name: string,
  findings?: AttachmentFindingLike[] | null
): MaterialQuantityHint | null {
  const key = name.trim().toLowerCase();
  for (const finding of findings ?? []) {
    for (const mat of finding.detectedMaterials ?? []) {
      if (mat.name.trim().toLowerCase() !== key) continue;
      if (mat.quantity && mat.quantity > 0) {
        return {
          quantity: roundQty(mat.quantity),
          unit: (mat.unit?.trim() || "pcs").toLowerCase(),
          sourceNote: mat.sourceNote?.trim() || "Z dokumentácie",
          confidence:
            mat.confidence === "high" || mat.confidence === "medium" ? mat.confidence : "medium",
        };
      }
    }
  }
  return null;
}

export function suggestMaterialQuantityFromFacts(
  name: string,
  unit: string | undefined | null,
  existingQuantity: number | undefined | null,
  facts?: ProjectFactsLike | null,
  findings?: AttachmentFindingLike[] | null
): MaterialQuantityHint | null {
  if (existingQuantity && existingQuantity > 0) return null;

  const fromAttachment = attachmentMaterialHint(name, findings);
  if (fromAttachment) return fromAttachment;

  const floorArea = sumFloorAreaM2(facts, findings);
  if (!floorArea) return null;

  const label = name.trim();
  const normalizedUnit = (unit ?? "").trim().toLowerCase();

  if (FLOOR_RE.test(label)) {
    return {
      quantity: floorArea,
      unit: normalizedUnit === "m2" || normalizedUnit === "m²" ? normalizedUnit : "m2",
      sourceNote: `Súčet podlahových plôch miestností (${floorArea} m²)`,
      confidence: "medium",
    };
  }

  if (ROOF_RE.test(label)) {
    return {
      quantity: floorArea,
      unit: "m2",
      sourceNote: `Odhadovaná plocha strechy z pôdorysu (${floorArea} m²)`,
      confidence: "medium",
    };
  }

  if (FACADE_RE.test(label) || (PLASTER_RE.test(label) && !INTERIOR_PLASTER_RE.test(label))) {
    const facade = estimateFacadeAreaM2(floorArea);
    if (facade <= 0) return null;
    return {
      quantity: facade,
      unit: "m2",
      sourceNote: `Odhad fasádnej plochy z pôdorysu (${facade} m²)`,
      confidence: "low",
    };
  }

  if (INTERIOR_PLASTER_RE.test(label)) {
    const walls = estimateInteriorWallAreaM2(floorArea);
    if (walls <= 0) return null;
    return {
      quantity: walls,
      unit: "m2",
      sourceNote: `Odhad vnútorných omietok z podlahovej plochy (${walls} m²)`,
      confidence: "low",
    };
  }

  if (INSULATION_RE.test(label)) {
    const area = ROOF_RE.test(label) ? floorArea : estimateFacadeAreaM2(floorArea);
    if (area <= 0) return null;
    return {
      quantity: area,
      unit: "m2",
      sourceNote: `Odhad plochy izolácie z dokumentácie (${area} m²)`,
      confidence: "low",
    };
  }

  if (normalizedUnit === "m2" || normalizedUnit === "m²") {
    return {
      quantity: floorArea,
      unit: "m2",
      sourceNote: `Celková známa plocha projektu (${floorArea} m²)`,
      confidence: "low",
    };
  }

  return null;
}

export type DraftMaterialSuggestionLike = {
  name: string;
  category?: string;
  quantity?: number | null;
  unit?: string | null;
  confidence?: "low" | "medium" | "high";
  source?: string;
  sourceNote?: string | null;
};

export function enrichDraftMaterialSuggestions<
  T extends DraftMaterialSuggestionLike,
>(draft: {
  materialSuggestions?: T[];
  projectFacts?: ProjectFactsLike | null;
  attachmentFindings?: AttachmentFindingLike[] | null;
}): T[] {
  const list = draft.materialSuggestions ?? [];
  if (list.length === 0) return list;

  return list.map((item) => {
    const hint = suggestMaterialQuantityFromFacts(
      item.name,
      item.unit,
      item.quantity,
      draft.projectFacts,
      draft.attachmentFindings
    );
    if (!hint) return item;

    return {
      ...item,
      quantity: hint.quantity,
      unit: item.unit?.trim() || hint.unit,
      confidence:
        item.confidence === "high"
          ? "high"
          : hint.confidence === "high"
            ? "high"
            : item.confidence ?? hint.confidence,
      sourceNote: item.sourceNote?.trim() || hint.sourceNote,
      source: item.source === "attachment" ? item.source : "attachment",
    };
  });
}
