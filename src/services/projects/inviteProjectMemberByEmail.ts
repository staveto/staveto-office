import {
  getFirestoreInstance,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "@/lib/firebase";

export type InviteProjectMemberInput = {
  projectId: string;
  email: string;
  name?: string;
  invitedByUid: string;
  permissionLevel?: "viewer" | "editor";
};

/**
 * Mobile-aligned project invite: creates projects/{id}/members doc with
 * status=invited. Invitee sees it in profile via listPendingInvites callable.
 */
export async function inviteProjectMemberByEmail(
  input: InviteProjectMemberInput
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("INVALID_EMAIL");
  }

  const membersRef = collection(db, "projects", input.projectId, "members");
  const [byLower, byEmail] = await Promise.all([
    getDocs(query(membersRef, where("emailLower", "==", email))),
    getDocs(query(membersRef, where("email", "==", email))),
  ]);
  if (!byLower.empty || !byEmail.empty) {
    throw new Error("ALREADY_MEMBER");
  }

  await addDoc(membersRef, {
    userId: null,
    email,
    emailLower: email,
    name: input.name?.trim() || null,
    role: "member",
    status: "invited",
    permissionLevel: input.permissionLevel ?? "editor",
    invitedBy: input.invitedByUid,
    invitedAt: serverTimestamp(),
    sharedItems: {
      tasks: true,
      phases: true,
      expenses: true,
      diary: true,
      documents: true,
      timeTracking: true,
    },
    sharedPhaseIds: [],
  });
}
