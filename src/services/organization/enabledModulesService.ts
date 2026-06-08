import { doc, setDoc, serverTimestamp } from "@/lib/firebase";
import { getFirestoreInstance } from "@/lib/firebase";
import { getOrganization } from "@/lib/organizations";
import {
  resolveEnabledModules,
  sanitizeEnabledModulesPatch,
  type EnabledModulesMap,
  type EnabledModulesPartial,
} from "@/lib/enabledModules";

export async function loadOrganizationEnabledModules(
  orgId: string
): Promise<EnabledModulesMap> {
  const org = await getOrganization(orgId);
  const resolved = resolveEnabledModules(org?.enabledModules ?? null);
  // Legacy orgs from onboarding stored planning:false by default — feature is live now.
  if (org?.enabledModules?.planning === false) {
    return { ...resolved, planning: true };
  }
  return resolved;
}

export async function saveOrganizationEnabledModules(
  orgId: string,
  patch: EnabledModulesPartial
): Promise<EnabledModulesMap> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const current = await loadOrganizationEnabledModules(orgId);
  const merged = resolveEnabledModules({
    ...current,
    ...sanitizeEnabledModulesPatch(patch),
  });

  await setDoc(
    doc(db, "organizations", orgId),
    {
      enabledModules: merged,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return merged;
}
