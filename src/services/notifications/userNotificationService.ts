import {
  getFirestoreInstance,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
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
  | "ABSENCE_APPROVED"
  | "INCOMING_EMAIL";

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
  inquiryId?: string;
  subject?: string;
  fromEmail?: string;
  intent?: string;
  confidence?: number;
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
    inquiryId: typeof data.inquiryId === "string" ? data.inquiryId : undefined,
    subject: typeof data.subject === "string" ? data.subject : undefined,
    fromEmail: typeof data.fromEmail === "string" ? data.fromEmail : undefined,
    intent: typeof data.intent === "string" ? data.intent : undefined,
    confidence: typeof data.confidence === "number" ? data.confidence : undefined,
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

/** One inbox row per project assignment (web + CF may both try to write). */
export function projectAssignedNotificationDocId(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `project-assigned-${safe}`;
}

function dedupeNotifications(rows: UserNotification[]): UserNotification[] {
  const byKey = new Map<string, UserNotification>();
  for (const row of sortNotifications(rows)) {
    const key =
      row.type === "PROJECT_ASSIGNED" || row.type === "PROJECT_INVITED"
        ? `${row.type}:${row.projectId ?? row.id}`
        : row.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
    const rowTime = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    if (rowTime >= existingTime) byKey.set(key, row);
  }
  return sortNotifications([...byKey.values()]);
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

  const notifId = projectAssignedNotificationDocId(input.projectId);
  const ts = serverTimestamp();

  await Promise.all([
    setDoc(
      doc(db, "users", input.targetUserId, "notifications", notifId),
      {
        type: "PROJECT_ASSIGNED",
        projectId: input.projectId,
        projectName: input.projectName,
        assignedBy: input.assignedBy,
        assignedByName: input.assignedByName ?? null,
        orgId: input.orgId ?? null,
        createdAt: ts,
        read: false,
      },
      { merge: true }
    ),
    setDoc(
      doc(db, "notifications", `${input.targetUserId}_${notifId}`),
      {
        userId: input.targetUserId,
        type: "PROJECT_ASSIGNED",
        projectId: input.projectId,
        projectName: input.projectName,
        fromUserId: input.assignedBy,
        fromUserName: input.assignedByName ?? null,
        orgId: input.orgId ?? null,
        message: "",
        severity: "info",
        createdAt: ts,
        readAt: null,
      },
      { merge: true }
    ),
  ]);
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
      const sorted = dedupeNotifications(rows).slice(0, 50);
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

  const allSnap = await getDocs(collection(db, "users", userId, "notifications"));
  await Promise.all(
    allSnap.docs
      .filter((d) => d.data().read !== true)
      .map((d) =>
        updateDoc(doc(db, "users", userId, "notifications", d.id), { read: true })
      )
  );
}

export function getNotificationProjectHref(notification: UserNotification): string | null {
  if (notification.type === "INCOMING_EMAIL" && notification.inquiryId) {
    return `/app/inbox/${notification.inquiryId}`;
  }
  if (notification.type === "PROJECT_INVITED") {
    return "/app/settings#project-invites";
  }
  if (!notification.projectId) return null;
  return `/app/projects/${notification.projectId}`;
}
