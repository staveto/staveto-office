import { ensureAuthTokenReady, getCallable, isFirebaseConfigured } from "@/lib/firebase";

export type OrgMemberProfile = {
  uid: string;
  displayName: string | null;
  email: string | null;
  role: string;
  status: string;
};

export async function listOrgMemberProfilesViaCallable(
  orgId: string,
  extraUserIds?: string[]
): Promise<OrgMemberProfile[] | null> {
  const trimmed = orgId.trim();
  if (!trimmed || !isFirebaseConfigured()) return null;

  try {
    await ensureAuthTokenReady();
    const callable = getCallable<
      { orgId: string; extraUserIds?: string[] },
      { members: OrgMemberProfile[] }
    >("listOrgMemberProfiles");
    const res = await callable({
      orgId: trimmed,
      extraUserIds: extraUserIds?.filter(Boolean),
    });
    return res.data?.members ?? [];
  } catch (err) {
    console.warn("[organizations] listOrgMemberProfiles callable failed", err);
    return null;
  }
}

/** Build a lookup map keyed by uid and email (lowercase). */
export function orgMemberProfileLookup(
  profiles: OrgMemberProfile[]
): Map<string, OrgMemberProfile> {
  const map = new Map<string, OrgMemberProfile>();
  for (const p of profiles) {
    map.set(p.uid, p);
    if (p.email?.trim()) map.set(p.email.trim().toLowerCase(), p);
  }
  return map;
}
