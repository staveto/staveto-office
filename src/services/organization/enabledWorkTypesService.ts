import { doc, setDoc, serverTimestamp } from "@/lib/firebase";
import { getFirestoreInstance } from "@/lib/firebase";
import { getOrganization } from "@/lib/organizations";
import {
  resolveEnabledWorkTypes,
  sanitizeEnabledWorkTypesPatch,
  type EnabledWorkTypesMap,
  type EnabledWorkTypesPartial,
} from "@/lib/enabledWorkTypes";

export async function loadOrganizationEnabledWorkTypes(
  orgId: string
): Promise<EnabledWorkTypesMap> {
  const org = await getOrganization(orgId);
  return resolveEnabledWorkTypes(org?.enabledWorkTypes ?? null);
}

export async function saveOrganizationEnabledWorkTypes(
  orgId: string,
  patch: EnabledWorkTypesPartial
): Promise<EnabledWorkTypesMap> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const current = await loadOrganizationEnabledWorkTypes(orgId);
  const merged = sanitizeEnabledWorkTypesPatch(current, patch);

  await setDoc(
    doc(db, "organizations", orgId),
    {
      enabledWorkTypes: merged,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return merged;
}
