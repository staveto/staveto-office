import {
  getFirestoreInstance,
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "@/lib/firebase";

export const ROOT_NOTIFICATION_ID_PREFIX = "root:";

export type UserNotificationType =
  | "PROJECT_ASSIGNED"
  | "PROJECT_INVITED"
  | "TASK_ASSIGNED"
  | "COMMENT_ADDED"
  | "REPORT_CREATED"
  | "ABSENCE_APPROVED"
  | "INCOMING_EMAIL"
  | "PROBLEM_REPORTED"
  | "PROBLEM_ASSIGNED"
  | "FIELD_NOTE_SHARED"
  | "PHOTO_ADDED"
  | "MEMBER_JOINED"
  | "ABSENCE_REQUESTED"
  | "TIMER_STARTED"
  | "TIMER_PAUSED"
  | "TIMER_STOPPED";

export type UserNotification = {
  id: string;
  type: UserNotificationType;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  taskName?: string;
  commentId?: string;
  reportId?: string;
  problemId?: string;
  noteId?: string;
  attachmentId?: string;
  absenceId?: string;
  escalated?: boolean;
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

function hasMeaningfulReadAt(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "string") return raw.trim().length > 0;
  return toIso(raw) != null;
}

function fromRootNotification(id: string, data: Record<string, unknown>): UserNotification | null {
  const type = data.type;
  if (typeof type !== "string") return null;
  const meta =
    data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
      ? (data.meta as Record<string, unknown>)
      : undefined;

  return {
    id: `${ROOT_NOTIFICATION_ID_PREFIX}${id}`,
    type: type as UserNotificationType,
    projectId: typeof data.projectId === "string" ? data.projectId : undefined,
    projectName: typeof data.projectName === "string" ? data.projectName : undefined,
    problemId:
      typeof data.problemId === "string"
        ? data.problemId
        : typeof meta?.problemId === "string"
          ? meta.problemId
          : undefined,
    noteId:
      typeof data.noteId === "string"
        ? data.noteId
        : typeof meta?.noteId === "string"
          ? meta.noteId
          : undefined,
    absenceId:
      typeof data.absenceId === "string"
        ? data.absenceId
        : typeof meta?.absenceId === "string"
          ? meta.absenceId
          : undefined,
    subject:
      typeof data.subject === "string"
        ? data.subject
        : typeof data.message === "string"
          ? data.message
          : undefined,
    attachmentId:
      typeof data.attachmentId === "string"
        ? data.attachmentId
        : typeof meta?.attachmentId === "string"
          ? meta.attachmentId
          : undefined,
    assignedBy: typeof data.fromUserId === "string" ? data.fromUserId : undefined,
    assignedByName: typeof data.fromUserName === "string" ? data.fromUserName : undefined,
    escalated: meta?.escalated === true || data.escalated === true,
    createdAt: toIso(data.createdAt),
    read: hasMeaningfulReadAt(data.readAt),
  };
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
    problemId: typeof data.problemId === "string" ? data.problemId : undefined,
    noteId: typeof data.noteId === "string" ? data.noteId : undefined,
    attachmentId: typeof data.attachmentId === "string" ? data.attachmentId : undefined,
    absenceId: typeof data.absenceId === "string" ? data.absenceId : undefined,
    escalated: data.escalated === true,
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

/** One inbox row per pending project invitation (requires accept/decline). */
export function projectInvitedNotificationDocId(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `project-invited-${safe}`;
}

function notificationDedupeKey(row: UserNotification): string {
  if (row.type === "PROJECT_ASSIGNED" || row.type === "PROJECT_INVITED") {
    return `${row.type}:${row.projectId ?? row.id}`;
  }
  if (row.type === "PROBLEM_REPORTED" || row.type === "PROBLEM_ASSIGNED") {
    return `${row.type}:${row.problemId ?? row.projectId ?? row.id}`;
  }
  if (row.type === "FIELD_NOTE_SHARED" && row.noteId) {
    return `FIELD_NOTE_SHARED:${row.noteId}`;
  }
  if (row.type === "PHOTO_ADDED" && row.attachmentId) {
    return `PHOTO_ADDED:${row.attachmentId}`;
  }
  if (row.type === "ABSENCE_REQUESTED" && row.absenceId) {
    return `ABSENCE_REQUESTED:${row.absenceId}`;
  }
  return row.id;
}

/** Prefer a read twin so dismissing on web or mobile clears the merged inbox row. */
function pickPreferredNotification(
  existing: UserNotification,
  candidate: UserNotification
): UserNotification {
  if (existing.read !== candidate.read) {
    return existing.read ? existing : candidate;
  }
  const existingTime = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
  const candidateTime = candidate.createdAt ? new Date(candidate.createdAt).getTime() : 0;
  return candidateTime >= existingTime ? candidate : existing;
}

function dedupeNotifications(rows: UserNotification[]): UserNotification[] {
  const byKey = new Map<string, UserNotification>();
  for (const row of sortNotifications(rows)) {
    const key = notificationDedupeKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    byKey.set(key, pickPreferredNotification(existing, row));
  }
  return sortNotifications([...byKey.values()]);
}

function officeTwinIdsFromNotification(
  n: Pick<
    UserNotification,
    "type" | "projectId" | "problemId" | "noteId" | "attachmentId" | "absenceId"
  >
): string[] {
  const ids: string[] = [];
  if (n.problemId) ids.push(`problem-${n.problemId}`);
  if (n.noteId) ids.push(`field-note-${n.noteId}`);
  if (n.attachmentId) ids.push(`photo-${n.attachmentId}`);
  if (n.absenceId) ids.push(`absence-${n.absenceId}`);
  if (n.projectId) {
    ids.push(projectAssignedNotificationDocId(n.projectId));
    ids.push(projectInvitedNotificationDocId(n.projectId));
  }
  return ids;
}

function rootMatchesOfficeTwin(
  data: Record<string, unknown>,
  officeId: string,
  notification?: UserNotification
): boolean {
  const type = typeof data.type === "string" ? data.type : "";
  const meta =
    data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
      ? (data.meta as Record<string, unknown>)
      : undefined;
  const problemId =
    (typeof data.problemId === "string" && data.problemId) ||
    (typeof meta?.problemId === "string" && meta.problemId) ||
    "";
  const noteId =
    (typeof data.noteId === "string" && data.noteId) ||
    (typeof meta?.noteId === "string" && meta.noteId) ||
    "";
  const attachmentId =
    (typeof data.attachmentId === "string" && data.attachmentId) ||
    (typeof meta?.attachmentId === "string" && meta.attachmentId) ||
    "";
  const absenceId =
    (typeof data.absenceId === "string" && data.absenceId) ||
    (typeof meta?.absenceId === "string" && meta.absenceId) ||
    "";
  const projectId = typeof data.projectId === "string" ? data.projectId : "";

  if (officeId.startsWith("problem-") && problemId && officeId === `problem-${problemId}`) {
    return type === "PROBLEM_REPORTED" || type === "PROBLEM_ASSIGNED";
  }
  if (officeId.startsWith("field-note-") && noteId && officeId === `field-note-${noteId}`) {
    return type === "FIELD_NOTE_SHARED";
  }
  if (officeId.startsWith("photo-") && attachmentId && officeId === `photo-${attachmentId}`) {
    return type === "PHOTO_ADDED";
  }
  if (officeId.startsWith("absence-") && absenceId && officeId === `absence-${absenceId}`) {
    return type === "ABSENCE_REQUESTED";
  }
  if (
    projectId &&
    (officeId === projectAssignedNotificationDocId(projectId) ||
      officeId === projectInvitedNotificationDocId(projectId))
  ) {
    return type === "PROJECT_ASSIGNED" || type === "PROJECT_INVITED";
  }
  if (notification) {
    return officeTwinIdsFromNotification(notification).includes(officeId);
  }
  return false;
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

/** Pending invite — invitee must accept before project access is granted. */
export async function createProjectInvitedNotification(input: {
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

  const notifId = projectInvitedNotificationDocId(input.projectId);
  const assignedNotifId = projectAssignedNotificationDocId(input.projectId);
  const ts = serverTimestamp();

  await Promise.all([
    setDoc(
      doc(db, "users", input.targetUserId, "notifications", notifId),
      {
        type: "PROJECT_INVITED",
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
        type: "PROJECT_INVITED",
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

  // Quiet legacy "assigned" rows for the same project so invite is the single CTA.
  await Promise.all([
    (async () => {
      try {
        const ref = doc(db, "users", input.targetUserId, "notifications", assignedNotifId);
        const snap = await getDoc(ref);
        if (snap.exists()) await setDoc(ref, { read: true, updatedAt: ts }, { merge: true });
      } catch {
        /* ignore */
      }
    })(),
    (async () => {
      try {
        const ref = doc(db, "notifications", `${input.targetUserId}_${assignedNotifId}`);
        const snap = await getDoc(ref);
        if (snap.exists()) await setDoc(ref, { readAt: ts }, { merge: true });
      } catch {
        /* ignore */
      }
    })(),
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

  let officeRows: UserNotification[] = [];
  let rootRows: UserNotification[] = [];

  const emit = () => {
    const sorted = dedupeNotifications([...officeRows, ...rootRows]).slice(0, 50);
    const unreadCount = sorted.filter((n) => !n.read).length;
    onData(sorted, unreadCount);
  };

  const officeRef = collection(db, "users", userId, "notifications");
  const rootRef = query(
    collection(db, "notifications"),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const unsubOffice = onSnapshot(
    officeRef,
    (snap) => {
      officeRows = snap.docs
        .map((d) => toNotification(d.id, d.data() as Record<string, unknown>))
        .filter((n): n is UserNotification => n != null);
      emit();
    },
    () => {
      officeRows = [];
      emit();
    }
  );

  const unsubRoot = onSnapshot(
    rootRef,
    (snap) => {
      rootRows = snap.docs
        .map((d) => fromRootNotification(d.id, d.data() as Record<string, unknown>))
        .filter((n): n is UserNotification => n != null);
      emit();
    },
    () => {
      rootRows = [];
      emit();
    }
  );

  return () => {
    unsubOffice();
    unsubRoot();
  };
}

async function markOfficeNotificationRead(userId: string, officeId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;
  try {
    await setDoc(
      doc(db, "users", userId, "notifications", officeId),
      { read: true, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch {
    /* twin may not exist */
  }
}

async function markRootNotificationRead(rootId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;
  try {
    await setDoc(
      doc(db, "notifications", rootId),
      { readAt: serverTimestamp(), read: true },
      { merge: true }
    );
  } catch {
    /* twin may not exist */
  }
}

/** Mark matching root twins for an office doc (covers random addDoc ids from mobile). */
async function markRootTwinsForOfficeNotification(
  userId: string,
  officeId: string,
  notification?: UserNotification
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) return;

  await markRootNotificationRead(`${userId}_${officeId}`);

  try {
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc"),
        limit(50)
      )
    );
    await Promise.all(
      snap.docs
        .filter((d) => {
          const data = d.data() as Record<string, unknown>;
          if (hasMeaningfulReadAt(data.readAt) || data.read === true) return false;
          return rootMatchesOfficeTwin(data, officeId, notification);
        })
        .map((d) => markRootNotificationRead(d.id))
    );
  } catch {
    /* index / permission — deterministic twin above is enough for invite/assign */
  }
}

/**
 * Mark one inbox row read on BOTH stores (office + root) so web and mobile stay in sync.
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
  notification?: UserNotification
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  if (notificationId.startsWith(ROOT_NOTIFICATION_ID_PREFIX)) {
    const rootId = notificationId.slice(ROOT_NOTIFICATION_ID_PREFIX.length);
    await markRootNotificationRead(rootId);

    const prefix = `${userId}_`;
    if (rootId.startsWith(prefix)) {
      await markOfficeNotificationRead(userId, rootId.slice(prefix.length));
    }

    let hint = notification;
    if (!hint) {
      try {
        const snap = await getDoc(doc(db, "notifications", rootId));
        if (snap.exists()) {
          hint = fromRootNotification(rootId, snap.data() as Record<string, unknown>) ?? undefined;
        }
      } catch {
        /* ignore */
      }
    }
    if (hint) {
      await Promise.all(
        officeTwinIdsFromNotification(hint).map((officeId) =>
          markOfficeNotificationRead(userId, officeId)
        )
      );
    }
    return;
  }

  await markOfficeNotificationRead(userId, notificationId);
  await markRootTwinsForOfficeNotification(userId, notificationId, notification);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const [officeSnap, rootSnap] = await Promise.all([
    getDocs(collection(db, "users", userId, "notifications")),
    getDocs(
      query(collection(db, "notifications"), where("userId", "==", userId), limit(50))
    ),
  ]);

  await Promise.all([
    ...officeSnap.docs
      .filter((d) => d.data().read !== true)
      .map((d) => updateDoc(doc(db, "users", userId, "notifications", d.id), { read: true })),
    ...rootSnap.docs
      .filter((d) => !hasMeaningfulReadAt(d.data().readAt))
      .map((d) => updateDoc(doc(db, "notifications", d.id), { readAt: serverTimestamp() })),
  ]);
}

export function getNotificationProjectHref(notification: UserNotification): string | null {
  if (notification.type === "INCOMING_EMAIL" && notification.inquiryId) {
    return `/app/inbox/${notification.inquiryId}`;
  }
  if (notification.type === "PROJECT_INVITED") {
    return "/app/settings#project-invites";
  }
  if (notification.type === "FIELD_NOTE_SHARED") {
    return notification.projectId
      ? `/app/projects/${notification.projectId}`
      : "/app";
  }
  if (
    notification.type === "PROBLEM_REPORTED" ||
    notification.type === "PROBLEM_ASSIGNED"
  ) {
    const base = notification.projectId
      ? `/app/projects/${notification.projectId}?tab=problems`
      : "/app/operations";
    return notification.problemId ? `${base}&problemId=${notification.problemId}` : base;
  }
  if (
    notification.type === "TIMER_STARTED" ||
    notification.type === "TIMER_PAUSED" ||
    notification.type === "TIMER_STOPPED"
  ) {
    return notification.projectId
      ? `/app/projects/${notification.projectId}`
      : "/app/operations";
  }
  if (!notification.projectId) return null;
  return `/app/projects/${notification.projectId}`;
}
