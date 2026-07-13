/**
 * User-confirmed symbol mappings — stored per organization so the resolver
 * learns company practice. Source is always "user_confirmed".
 */

import {
  addDoc,
  collection,
  getFirestoreInstance,
  serverTimestamp,
} from "@/lib/firebase";
import type { NormalizedElectricalPoint } from "@/lib/ai/electricalAssemblyTemplates";
import type { KnowledgeTrade } from "@/types/estimatorKnowledge";

export type SaveCustomSymbolMappingInput = {
  orgId: string;
  trade: KnowledgeTrade;
  countryCode: string;
  detectedText: string;
  normalizedPoint: NormalizedElectricalPoint;
  assemblyTemplateId?: string;
  createdBy: string;
};

/** Sanitized additive write — no reads/overwrites of existing mappings. */
export async function saveCustomSymbolMapping(
  input: SaveCustomSymbolMappingInput
): Promise<string | null> {
  const fs = getFirestoreInstance();
  if (!fs) return null;
  const detectedText = input.detectedText.trim();
  if (!input.orgId || !detectedText || input.normalizedPoint === "unknown") {
    return null;
  }
  const ref = await addDoc(
    collection(fs, "organizations", input.orgId, "customSymbolMappings"),
    {
      orgId: input.orgId,
      trade: input.trade,
      countryCode: input.countryCode.toUpperCase(),
      detectedText,
      normalizedPoint: input.normalizedPoint,
      ...(input.assemblyTemplateId ? { assemblyTemplateId: input.assemblyTemplateId } : {}),
      createdBy: input.createdBy,
      createdAt: serverTimestamp(),
      source: "user_confirmed",
    }
  );
  return ref.id;
}
