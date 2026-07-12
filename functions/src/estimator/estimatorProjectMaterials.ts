import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import type { EstimatorFactsPayload } from "./estimatorSchema";
import { sanitizeForFirestore } from "../utils/firestoreSanitizer";

type MaterialItem = EstimatorFactsPayload["extractedItems"][number];

const CATEGORY_ORDER: Record<string, number> = {
  socket: 10,
  switch: 20,
  lighting: 30,
  led_strip: 40,
  distribution_board: 50,
  cable: 60,
  installation_material: 70,
  labor: 80,
  travel: 90,
  other: 100,
};

/**
 * Purchase / quote BOM: merge same title+unit across rooms so the estimator
 * sees one clear line (room breakdown stays in description).
 */
export function collectEstimatorMaterialRows(facts: EstimatorFactsPayload): MaterialItem[] {
  const raw = [
    ...facts.extractedItems.filter((i) => i.included !== false),
    ...facts.inferredItems.filter((i) => i.included !== false && i.origin !== "missing"),
  ];

  type Acc = {
    item: MaterialItem;
    qtySum: number;
    hasQty: boolean;
    rooms: string[];
  };
  const map = new Map<string, Acc>();

  for (const item of raw) {
    const title = (item.title ?? "").trim();
    if (!title) continue;
    const unit = item.unit && item.unit !== "unknown" ? item.unit : "ks";
    const key = `${item.category}|${title.toLowerCase()}|${unit}`;
    const qtyRaw = item.computedQuantity ?? item.quantity;
    const hasQty =
      typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw > 0;
    const room = item.roomName?.trim();

    const existing = map.get(key);
    if (existing) {
      if (hasQty) {
        existing.qtySum += qtyRaw;
        existing.hasQty = true;
      }
      if (room && !existing.rooms.includes(room)) existing.rooms.push(room);
      if (item.needsReview) existing.item.needsReview = true;
      continue;
    }
    map.set(key, {
      item: { ...item, title, unit },
      qtySum: hasQty ? qtyRaw : 0,
      hasQty,
      rooms: room ? [room] : [],
    });
  }

  return [...map.values()]
    .map(({ item, qtySum, hasQty, rooms }) => {
      const roomNote =
        rooms.length > 0
          ? `Miestnosti: ${rooms.join(", ")}.`
          : item.roomName
            ? `Miestnosť: ${item.roomName}.`
            : "";
      return {
        ...item,
        roomName: undefined,
        quantity: hasQty ? qtySum : undefined,
        computedQuantity: hasQty ? qtySum : undefined,
        description: [item.description, roomNote].filter(Boolean).join(" ").trim() || undefined,
      };
    })
    .sort((a, b) => {
      const oa = CATEGORY_ORDER[a.category] ?? 99;
      const ob = CATEGORY_ORDER[b.category] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.title.localeCompare(b.title, "sk");
    })
    .slice(0, 200);
}

/** Clean purchase name — room stays in description, not in the title. */
export function estimatorItemDisplayName(item: MaterialItem): string {
  return (item.title ?? "").trim();
}

/**
 * Write estimator takeoff into project materials / suggestions / quoteItems.
 * When replaceMaterialQuoteItems is true, existing material quote lines and
 * suggestions are deleted first (work lines kept).
 */
export async function writeEstimatorMaterialsToProject(params: {
  db: Firestore;
  projectId: string;
  uid: string;
  facts: EstimatorFactsPayload;
  replaceMaterialQuoteItems?: boolean;
  /** Optional unit prices keyed by normalized title (from quote/estimate lines). */
  unitPriceByTitle?: Map<string, number>;
}): Promise<{ materialCount: number }> {
  const { db, projectId, uid, facts } = params;
  const projectRef = db.collection("projects").doc(projectId);
  const now = FieldValue.serverTimestamp();
  const materialRows = collectEstimatorMaterialRows(facts);
  const priceMap = params.unitPriceByTitle ?? new Map<string, number>();

  const lookupPrice = (name: string): number => {
    const key = name.trim().toLowerCase();
    if (priceMap.has(key)) return priceMap.get(key)!;
    for (const [k, v] of priceMap) {
      if (key.includes(k) || k.includes(key)) return v;
    }
    return 0;
  };

  if (params.replaceMaterialQuoteItems) {
    const [qiSnap, sugSnap, matSnap] = await Promise.all([
      projectRef.collection("quoteItems").get(),
      projectRef.collection("materialSuggestions").get(),
      projectRef.collection("materials").get(),
    ]);
    const clearBatch = db.batch();
    let ops = 0;
    for (const doc of qiSnap.docs) {
      const cat = doc.data()?.category;
      if (cat === "work") continue;
      clearBatch.delete(doc.ref);
      ops++;
    }
    for (const doc of sugSnap.docs) {
      clearBatch.delete(doc.ref);
      ops++;
    }
    for (const doc of matSnap.docs) {
      clearBatch.delete(doc.ref);
      ops++;
    }
    if (ops > 0) await clearBatch.commit();
  }

  const batch = db.batch();
  const quoteItemNames = new Set<string>();
  let quoteOrder = 0;
  let materialCount = 0;

  for (const item of materialRows) {
    const displayName = estimatorItemDisplayName(item);
    if (!displayName) continue;

    const qtyRaw = item.computedQuantity ?? item.quantity;
    const hasQty =
      typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw > 0;
    // Do not invent piece counts — missing qty stays unset (setup shows empty).
    const qty = hasQty ? qtyRaw : undefined;
    const unit = item.unit && item.unit !== "unknown" ? item.unit : "ks";
    const isWork = item.category === "labor" || item.category === "travel";
    const note = [
      item.roomName ? `Miestnosť: ${item.roomName}` : null,
      item.description,
      item.evidence?.[0]?.fileName
        ? `Zdroj: ${item.evidence[0].fileName}${
            item.evidence[0].page ? ` s.${item.evidence[0].page}` : ""
          }`
        : null,
      `origin=${item.origin}`,
      `confidence=${item.confidence}`,
      item.needsReview ? "needsReview" : null,
      !hasQty ? "quantityMissing" : null,
    ]
      .filter(Boolean)
      .join(" | ");

    if (!isWork) {
      materialCount++;
      batch.set(
        projectRef.collection("materials").doc(),
        sanitizeForFirestore({
          name: displayName,
          quantity: qty ?? null,
          unit,
          note,
          createdAt: now,
          updatedAt: now,
        })
      );
      batch.set(
        projectRef.collection("materialSuggestions").doc(),
        sanitizeForFirestore({
          projectId,
          name: displayName,
          category: item.category ?? null,
          description: item.description ?? null,
          suggestedQuantity: qty ?? null,
          unit,
          confidence: item.confidence ?? null,
          source: "ai",
          sourceNote: note,
          status: "planned",
          createdBy: uid,
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    const nameKey = displayName.toLowerCase();
    if (!quoteItemNames.has(nameKey)) {
      quoteItemNames.add(nameKey);
      const unitPrice = lookupPrice(displayName);
      batch.set(
        projectRef.collection("quoteItems").doc(),
        sanitizeForFirestore({
          name: displayName,
          description: item.description ?? note ?? "",
          category: isWork ? "work" : "material",
          // Quote draft schema expects a number; 0 = "not counted yet" in AI setup UI.
          qty: qty ?? 0,
          unit,
          unitPrice,
          order: quoteOrder++,
          note: !hasQty ? "Počet ešte nie je spočítaný — doplňte." : undefined,
          createdAt: now,
          updatedAt: now,
        })
      );
    }
  }

  batch.set(
    projectRef,
    sanitizeForFirestore({
      updatedAt: now,
      lifecycleStatus: materialCount > 0 ? "quote_drafted" : undefined,
      quoteStatus: materialCount > 0 ? "draft" : undefined,
    }),
    { merge: true }
  );

  await batch.commit();
  return { materialCount };
}
