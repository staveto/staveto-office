import {
  getFirestoreInstance,
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "@/lib/firebase";
import type { ProjectDoc } from "@/lib/projects";
import { listOrgMembers } from "@/lib/organizations";
import {
  listOrgMemberProfilesViaCallable,
  orgMemberProfileLookup,
} from "@/services/organizations/orgMemberProfilesService";
import type { ProjectMemberRecord } from "./taskPlanningTypes";

function toMemberRecord(
  id: string,
  data: Record<string, unknown>
): ProjectMemberRecord | null {
  const hasUserIdField = Object.prototype.hasOwnProperty.call(data, "userId");
  const userId =
    typeof data.userId === "string"
      ? data.userId
      : !hasUserIdField
        ? id
        : "";
  if (!userId) return null;

  const status = (data.status as string) || (userId ? "active" : "invited");
  if (status === "removed") return null;

  const sharedItemsRaw = (data.sharedItems as Record<string, unknown>) ?? {};
  const sharedItems = {
    tasks: sharedItemsRaw.tasks !== false,
    phases: sharedItemsRaw.phases !== false,
    expenses: sharedItemsRaw.expenses !== false,
    diary: sharedItemsRaw.diary !== false,
    documents: sharedItemsRaw.documents !== false,
    timeTracking: sharedItemsRaw.timeTracking !== false,
  };
  if (sharedItems.tasks === false) return null;

  const rawName =
    (typeof data.name === "string" && data.name.trim()) ||
    (typeof data.displayName === "string" && data.displayName.trim()) ||
    undefined;
  const rawEmail =
    (typeof data.email === "string" && data.email.trim()) ||
    (typeof data.emailLower === "string" && data.emailLower.trim()) ||
    undefined;

  return {
    id,
    userId,
    email: rawEmail,
    name: rawName,
    role: (data.role as "owner" | "member") || "member",
    status: status as ProjectMemberRecord["status"],
    permissionLevel: (data.permissionLevel as "viewer" | "editor") || "editor",
    sharedItems,
  };
}

/** Assignable task members — project subcollection with org-member fallback. */
export async function listProjectMembers(projectId: string): Promise<ProjectMemberRecord[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  try {
    const snap = await getDocs(collection(db, "projects", projectId, "members"));
    const fromSub = snap.docs
      .map((d) => toMemberRecord(d.id, d.data() as Record<string, unknown>))
      .filter((m): m is ProjectMemberRecord => m != null);
    if (fromSub.length > 0) {
      return dedupeMembers(fromSub);
    }
  } catch {
    /* fallback below */
  }

  return [];
}

export async function listAssignableProjectMembers(
  project: ProjectDoc
): Promise<ProjectMemberRecord[]> {
  const fromSub = await listProjectMembers(project.id);
  if (fromSub.length > 0) {
    return enrichMemberDisplayNames(project, fromSub);
  }

  const members: ProjectMemberRecord[] = [];
  const seen = new Set<string>();

  const add = (userId: string, name?: string, email?: string, role: "owner" | "member" = "member") => {
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    members.push({
      id: userId,
      userId,
      name,
      email,
      role,
      status: "active",
      permissionLevel: "editor",
      sharedItems: { tasks: true },
    });
  };

  if (project.ownerId) {
    add(project.ownerId, undefined, undefined, "owner");
  }

  for (const uid of project.assignedMemberIds ?? []) {
    add(uid);
  }

  if (project.orgId) {
    try {
      const orgMembers = await listOrgMembers(project.orgId);
      for (const om of orgMembers) {
        if (om.status === "removed") continue;
        add(om.uid, om.displayName ?? undefined, om.email);
      }
    } catch {
      /* ignore */
    }
  }

  return enrichMemberDisplayNames(project, members);
}

function dedupeMembers(members: ProjectMemberRecord[]): ProjectMemberRecord[] {
  const byUid = new Map<string, ProjectMemberRecord>();
  for (const m of members) {
    if (!byUid.has(m.userId)) byUid.set(m.userId, m);
  }
  return [...byUid.values()];
}

async function enrichMemberDisplayNames(
  project: ProjectDoc,
  members: ProjectMemberRecord[]
): Promise<ProjectMemberRecord[]> {
  if (members.length === 0) return members;

  const needsEnrichment = members.some((m) => !m.name?.trim() && !m.email?.trim());
  if (!needsEnrichment) return members;

  const effectiveOrgId = project.orgId?.trim() || project.workspaceId?.trim();
  const userIds = members.map((m) => m.userId);

  const orgProfiles = effectiveOrgId
    ? await listOrgMemberProfilesViaCallable(effectiveOrgId, userIds)
    : null;
  const profileByKey = orgMemberProfileLookup(orgProfiles ?? []);
  const resolveProfile = (id: string) =>
    profileByKey.get(id) ?? profileByKey.get(id.toLowerCase());

  let orgMemberByUid = new Map<string, { name?: string; email?: string }>();
  if (!orgProfiles?.length && effectiveOrgId) {
    try {
      const rows = await listOrgMembers(effectiveOrgId);
      orgMemberByUid = new Map(
        rows.map((r) => [
          r.uid,
          { name: r.displayName?.trim() || undefined, email: r.email?.trim() || undefined },
        ])
      );
    } catch {
      /* ignore */
    }
  }

  return members.map((m) => {
    const profile = resolveProfile(m.userId);
    const orgRow = orgMemberByUid.get(m.userId);
    return {
      ...m,
      name:
        m.name?.trim() ||
        profile?.displayName?.trim() ||
        orgRow?.name ||
        undefined,
      email:
        m.email?.trim() ||
        profile?.email?.trim() ||
        orgRow?.email ||
        undefined,
    };
  });
}

export type UpsertProjectMemberInput = {
  userId: string;
  name?: string;
  email?: string;
  role?: "owner" | "member";
};

/**
 * Stores assignable project members in projects/{id}/members.
 * Existing non-selected members are marked as removed.
 */
export async function upsertProjectMembers(
  projectId: string,
  selected: UpsertProjectMemberInput[],
  previousMemberIds: string[],
  actorUid?: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const selectedById = new Map<string, UpsertProjectMemberInput>();
  for (const item of selected) {
    const uid = item.userId?.trim();
    if (!uid) continue;
    selectedById.set(uid, item);
  }

  await Promise.all(
    [...selectedById.values()].map((member) =>
      setDoc(
        doc(db, "projects", projectId, "members", member.userId),
        {
          userId: member.userId,
          name: member.name ?? null,
          email: member.email ?? null,
          role: member.role ?? "member",
          status: "active",
          permissionLevel: "editor",
          addedBy: actorUid ?? null,
          sharedItems: {
            tasks: true,
            phases: true,
            expenses: true,
            diary: true,
            documents: true,
            timeTracking: true,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    )
  );

  const selectedIds = new Set(selectedById.keys());
  const toRemove = previousMemberIds.filter((uid) => !selectedIds.has(uid));

  await Promise.all(
    toRemove.map((uid) =>
      setDoc(
        doc(db, "projects", projectId, "members", uid),
        { status: "removed", updatedAt: serverTimestamp() },
        { merge: true }
      )
    )
  );
}
