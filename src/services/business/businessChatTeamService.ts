import { getOrganization, getMemberDisplayName, listOrgMembers, isOrgMemberActive } from "@/lib/organizations";
import {
  buildCompanyTeamRows,
  getCompanyRoleLabelKey,
  type CompanyTeamMemberRow,
} from "@/lib/companyRoles";
import { getFirestoreInstance } from "@/lib/firebase";

export type ChatTeamMember = {
  uid: string;
  displayName: string;
  email?: string;
  roleLabelKey: string;
  status: string;
};

export async function listChatTeamMembers(
  orgId: string,
  excludeUid?: string
): Promise<ChatTeamMember[]> {
  const org = await getOrganization(orgId);
  if (!org) return [];

  const members = await listOrgMembers(orgId);
  let ownerName: string | null = null;
  const db = getFirestoreInstance();
  if (db && org.ownerUid) {
    try {
      ownerName = await getMemberDisplayName(db, org.ownerUid);
    } catch {
      ownerName = null;
    }
  }

  const rows = buildCompanyTeamRows({
    org,
    members,
    ownerDisplayName: ownerName,
  });

  return rows
    .filter((row) => {
      const memberUid = row.userId ?? row.uid;
      if (excludeUid && memberUid === excludeUid) return false;
      return isOrgMemberActive({ status: row.status });
    })
    .map((row) => toChatTeamMember(row));
}

function toChatTeamMember(row: CompanyTeamMemberRow): ChatTeamMember {
  const uid = row.userId ?? row.uid;
  const displayName = row.displayName?.trim() || row.email?.trim() || uid;
  return {
    uid,
    displayName,
    email: row.email,
    roleLabelKey: getCompanyRoleLabelKey(row.effectiveRole),
    status: row.status ?? "active",
  };
}

export function filterChatTeamMembers(
  members: ChatTeamMember[],
  query: string
): ChatTeamMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => {
    const haystack = [m.displayName, m.email ?? "", m.uid].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}
