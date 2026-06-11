import {
  getFirestoreInstance,
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "@/lib/firebase";

export type UserNotificationType =
  | "PROJECT_ASSIGNED"
  | "PROJECT_INVITED"
  | "TASK_ASSIGNED"
  | "COMMENT_ADDED"
  | "REPORT_CREATED"
  | "ABSENCE_APPROVED";

export type UserNotification = {
  id: string;
  type: UserNotificationType;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  taskName?: string;
  commentId?: string;
  reportId?: string;
  assignedBy?: string;
  assignedByName?: string;
  orgId?: string;
  createdAt?: string;
  read: boolean;
};

function toIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toNotification(id: string, data: Record<string, unknown>): UserNotification | null {
  const type = data.type;
  if (typeof type !== "string") return null;

  return {
    id,
    type: type as UserNotificationType,
    projectId: typeof data.projectId === "string" ? data.projectId : undefined,
    projectName: typeof data.projectName === "string" ? data.projectName : undefined,
    taskId: typeof data.taskId === "string" ? data.taskId : undefined,
    taskName: typeof data.taskName === "string" ? data.taskName : undefined,
    commentId: typeof data.commentId === "string" ? data.commentId : undefined,
    reportId: typeof data.reportId === "string" ? data.reportId : undefined,
    assignedBy: typeof data.assignedBy === "string" ? data.assignedBy : undefined,
    assignedByName: typeof data.assignedByName === "string" ? data.assignedByName : undefined,
    orgId: typeof data.orgId === "string" ? data.orgId : undefined,
    createdAt: toIso(data.createdAt),
    read: data.read === true,
  };
}

function sortNotifications(rows: UserNotification[]): UserNotification[] {
  return [...rows].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

export async function createProjectAssignedNotification(input: {
  targetUserId: string;
  projectId: string;
  projectName: string;
  assignedBy: string;
  assignedByName?: string;
  orgId?: string;
}): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  if (!input.targetUserId.trim() || input.targetUserId === input.assignedBy) return;

  await addDoc(collection(db, "users", input.targetUserId, "notifications"), {
    type: "PROJECT_ASSIGNED",
    projectId: input.projectId,
    projectName: input.projectName,
    assignedBy: input.assignedBy,
    assignedByName: input.assignedByName ?? null,
    orgId: input.orgId ?? null,
    createdAt: serverTimestamp(),
    read: false,
  });
}

export function subscribeUserNotifications(
  userId: string,
  onData: (notifications: UserNotification[], unreadCount: number) => void
): () => void {
  const db = getFirestoreInstance();
  if (!db) {
    onData([], 0);
    return () => undefined;
  }

  const ref = collection(db, "users", userId, "notifications");
  return onSnapshot(
    ref,
    (snap) => {
      const rows = snap.docs
        .map((d) => toNotification(d.id, d.data() as Record<string, unknown>))
        .filter((n): n is UserNotification => n != null);
      const sorted = sortNotifications(rows).slice(0, 50);
      const unreadCount = sorted.filter((n) => !n.read).length;
      onData(sorted, unreadCount);
    },
    () => onData([], 0)
  );
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await updateDoc(doc(db, "users", userId, "notifications", notificationId), {
    read: true,
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const unreadQuery = query(
    collection(db, "users", userId, "notifications"),
    where("read", "==", false)
  );
  const snap = await getDocs(unreadQuery);
  await Promise.all(
    snap.docs.map((d) =>
      updateDoc(doc(db, "users", userId, "notifications", d.id), { read: true })
    )
  );
}

export function getNotificationProjectHref(notification: UserNotification): string | null {
  if (notification.type === "PROJECT_INVITED") {
    return "/app/settings#project-invites";
  }
  if (!notification.projectId) return null;
  return `/app/projects/${notification.projectId}`;
}
