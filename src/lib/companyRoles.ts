/**
 * Mobile-aligned company team roles (organizations/{orgId}/members).
 * Display + permission helpers — no Firestore schema changes.
 */
import type { Organization, OrgMember, OrgMemberRow, OrgMemberRole } from "./organizations";

/** Canonical business roles (mobile source-of-truth). */
export type CanonicalCompanyRole =
  | "owner"
  | "admin"
  | "manager"
  | "worker"
  | "viewer";

const ROLE_PRIORITY: Record<CanonicalCompanyRole, number> = {
  owner: 0,
  admin: 1,
  manager: 2,
  worker: 3,
  viewer: 4,
};

/** i18n key under members.role.* */
export function getCompanyRoleLabelKey(role: CanonicalCompanyRole | string): string {
  const r = String(role ?? "").toLowerCase();
  if (r === "owner") return "members.role.owner";
  if (r === "admin") return "members.role.admin";
  if (r === "manager") return "members.role.manager";
  if (r === "worker") return "members.role.worker";
  if (r === "viewer" || r === "client") return "members.role.viewer";
  if (r === "member") return "members.role.teamMember";
  return "members.role.viewer";
}

/** Optional short description i18n key. */
export function getCompanyRoleDescriptionKey(role: CanonicalCompanyRole | string): string | null {
  const r = String(role ?? "").toLowerCase();
  if (r === "owner") return "members.roleDesc.owner";
  if (r === "admin") return "members.roleDesc.admin";
  if (r === "viewer" || r === "member") return "members.roleDesc.viewer";
  return null;
}

/** Map stored Firestore member role to canonical display role. ownerUid always wins. */
export function getEffectiveOrgRole(
  org: Pick<Organization, "ownerUid"> | null | undefined,
  member: Pick<OrgMember, "role"> | null | undefined,
  userId: string
): CanonicalCompanyRole {
  if (org?.ownerUid === userId) return "owner";

  const raw = String(member?.role ?? "member").toLowerCase();
  if (raw === "owner") return "owner";
  if (raw === "admin") return "admin";
  if (raw === "manager") return "manager";
  if (raw === "worker") return "worker";
  if (raw === "viewer" || raw === "client") return "viewer";
  /** Web legacy invite/member doc — read-only team access in UI. */
  if (raw === "member") return "viewer";
  return "viewer";
}

export function isOrgOwner(
  org: Pick<Organization, "ownerUid"> | null | undefined,
  userId: string | undefined
): boolean {
  return !!userId && org?.ownerUid === userId;
}

/** Owner and admin may invite (mobile-aligned managerial invite). */
export function canInviteCompanyMembers(
  effectiveRole: CanonicalCompanyRole | null | undefined
): boolean {
  return effectiveRole === "owner" || effectiveRole === "admin";
}

/** Owner and admin may change/remove non-owner members (subject to Firestore rules). */
export function canManageCompanyMembers(
  effectiveRole: CanonicalCompanyRole | null | undefined
): boolean {
  return effectiveRole === "owner" || effectiveRole === "admin";
}

/** Web invite backend only supports admin | member — never owner. */
export function getInviteRoleLabelKey(storedInviteRole: OrgMemberRole | string): string {
  const r = String(storedInviteRole).toLowerCase();
  if (r === "admin") return "members.role.admin";
  return "members.role.viewer";
}

export function mapInviteRoleToEffective(storedInviteRole: OrgMemberRole | string): CanonicalCompanyRole {
  const r = String(storedInviteRole).toLowerCase();
  if (r === "admin") return "admin";
  return "viewer";
}

/** Roles editable via web invite backend (admin | member). */
export function isWebEditableStoredRole(storedRole: string | undefined): boolean {
  const r = String(storedRole ?? "").toLowerCase();
  return r === "admin" || r === "member";
}

export type CompanyTeamMemberRow = {
  uid: string;
  userId?: string;
  displayName?: string | null;
  email?: string;
  effectiveRole: CanonicalCompanyRole;
  storedRole?: string;
  status: string;
  /** UI-only row when ownerUid has no members/{uid} document. */
  synthetic?: boolean;
};

export type BuildTeamRowsInput = {
  org: Organization;
  members: OrgMemberRow[];
  ownerDisplayName?: string | null;
  ownerEmail?: string | null;
};

/** Build sorted team list with synthetic owner row when needed. */
export function buildCompanyTeamRows(input: BuildTeamRowsInput): CompanyTeamMemberRow[] {
  const { org, members, ownerDisplayName, ownerEmail } = input;
  const ownerUid = org.ownerUid;
  if (!ownerUid) return [];

  const byUid = new Map<string, CompanyTeamMemberRow>();
  let ownerFromMembers: CompanyTeamMemberRow | null = null;

  for (const m of members) {
    const memberUid = m.userId ?? m.uid;
    const effectiveRole = getEffectiveOrgRole(org, m, memberUid);
    const row: CompanyTeamMemberRow = {
      uid: m.uid,
      userId: memberUid,
      displayName: m.displayName,
      email: m.email,
      effectiveRole,
      storedRole: typeof m.role === "string" ? m.role : undefined,
      status: m.status ?? "active",
      synthetic: false,
    };
    byUid.set(memberUid, row);
    if (memberUid === ownerUid) {
      ownerFromMembers = { ...row, effectiveRole: "owner" };
    }
  }

  if (!ownerFromMembers) {
    byUid.set(ownerUid, {
      uid: ownerUid,
      userId: ownerUid,
      displayName: ownerDisplayName ?? null,
      email: ownerEmail ?? undefined,
      effectiveRole: "owner",
      status: "active",
      synthetic: true,
    });
  } else {
    byUid.set(ownerUid, { ...ownerFromMembers, effectiveRole: "owner" });
  }

  return [...byUid.values()].sort((a, b) => {
    const pa = ROLE_PRIORITY[a.effectiveRole] ?? 99;
    const pb = ROLE_PRIORITY[b.effectiveRole] ?? 99;
    if (pa !== pb) return pa - pb;
    const na = (a.displayName || a.email || a.uid).toLowerCase();
    const nb = (b.displayName || b.email || b.uid).toLowerCase();
    return na.localeCompare(nb, undefined, { sensitivity: "base" });
  });
}

export function getMemberStatusLabelKey(status: string | undefined): string {
  const s = String(status ?? "active").toLowerCase();
  if (s === "active") return "members.status.active";
  if (s === "invited") return "members.status.invited";
  if (s === "removed") return "members.status.removed";
  if (s === "pending") return "members.status.pending";
  return "members.status.active";
}

export function countActiveTeamSeats(rows: CompanyTeamMemberRow[]): number {
  return rows.filter((r) => {
    const s = String(r.status ?? "active").toLowerCase();
    return !s || s === "active";
  }).length;
}
