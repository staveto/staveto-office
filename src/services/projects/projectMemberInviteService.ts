import {
  getFirestoreInstance,
  collection,
  addDoc,
  serverTimestamp,
} from "@/lib/firebase";

export type CreateProjectMemberInviteInput = {
  targetUserId: string;
  orgId: string;
  projectId: string;
  projectName: string;
  invitedByUid: string;
  invitedByName?: string;
};

/**
 * Optional inbox row under users/{uid}/projectInvites.
 * Primary invite path writes projects/.../members status=invited + PROJECT_INVITED.
 */
export async function createProjectMemberInviteNotification(
  input: CreateProjectMemberInviteInput
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  if (!input.targetUserId.trim()) return;

  await addDoc(collection(db, "users", input.targetUserId, "projectInvites"), {
    type: "project_member_invite",
    status: "pending",
    orgId: input.orgId,
    projectId: input.projectId,
    projectName: input.projectName,
    invitedByUid: input.invitedByUid,
    invitedByName: input.invitedByName ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
