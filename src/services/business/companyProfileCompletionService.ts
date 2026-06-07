import { getFirestoreInstance, doc, getDoc, getCallable } from "@/lib/firebase";
import {
  getCompanyProfileCompletion,
  type CanonicalOrganizationRecord,
  type CompanyProfileCompletion,
} from "@/lib/companyProfileCompletion";

export type { CompanyProfileCompletion };

export async function loadCompanyProfileCompletion(
  orgId: string
): Promise<CompanyProfileCompletion | null> {
  const db = getFirestoreInstance();
  if (!db || !orgId.trim()) return null;

  const snap = await getDoc(doc(db, "organizations", orgId));
  if (!snap.exists()) return null;

  return getCompanyProfileCompletion({
    id: snap.id,
    ...(snap.data() as CanonicalOrganizationRecord),
  });
}

export async function backfillOwnedBusinessOrgs(orgId?: string): Promise<{
  updatedOrgIds: string[];
  skippedOrgIds: string[];
}> {
  const callable = getCallable<
    { orgId?: string },
    { ok: true; updatedOrgIds: string[]; skippedOrgIds: string[] }
  >("backfillBusinessOrgCompatibility");
  const res = await callable(orgId ? { orgId } : {});
  return {
    updatedOrgIds: res.data?.updatedOrgIds ?? [],
    skippedOrgIds: res.data?.skippedOrgIds ?? [],
  };
}
