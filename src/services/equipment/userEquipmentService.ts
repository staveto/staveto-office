/**
 * User equipment CRUD — mirrors mobile `userEquipment.ts`.
 * Path: users/{uid}/equipment/{id}
 */
import {
  getFirestoreInstance,
  getAuthInstance,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "@/lib/firebase";
import type {
  CreateUserEquipmentInput,
  EquipmentCategory,
  UpdateUserEquipmentInput,
  UserEquipmentDoc,
  UserEquipmentStatus,
} from "@/services/equipment/types";

function userEquipmentPath(uid: string): string {
  return `users/${uid}/equipment`;
}

function userEquipmentItemPath(uid: string, equipmentId: string): string {
  return `users/${uid}/equipment/${equipmentId}`;
}

function toIso(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function toDoc(uid: string, snap: { id: string; data: () => Record<string, unknown> }): UserEquipmentDoc {
  const d = snap.data();
  const statusRaw = d.status as string | undefined;
  const status: UserEquipmentStatus =
    statusRaw === "assigned" || statusRaw === "in_service" || statusRaw === "inactive"
      ? statusRaw
      : "available";
  return {
    id: snap.id,
    ownerId: (d.ownerId as string) ?? uid,
    name: (d.name as string) ?? "",
    category: (d.category as EquipmentCategory | string) ?? "other",
    kind: (d.kind as string) || undefined,
    status,
    serialNumber: (d.serialNumber as string) || undefined,
    internalCode: (d.internalCode as string) || undefined,
    locationText: (d.locationText as string) || undefined,
    notes: (d.notes as string) || undefined,
    photoUrl: (d.photoUrl as string) || undefined,
    photoPath: (d.photoPath as string) || undefined,
    assignedProjectId: (d.assignedProjectId as string) || null,
    assignedToUserId: (d.assignedToUserId as string) || null,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    model: (d.model as string) || undefined,
  };
}

function requireAuthUid(): string {
  const uid = getAuthInstance()?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

export async function listUserEquipment(
  uid: string,
  opts?: { status?: UserEquipmentStatus | "all" }
): Promise<UserEquipmentDoc[]> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const col = collection(db, userEquipmentPath(uid));
  let rows: UserEquipmentDoc[];

  try {
    const q = query(col, orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    rows = snap.docs.map((d) => toDoc(uid, { id: d.id, data: () => d.data() }));
  } catch (error: unknown) {
    const code = String((error as { code?: string })?.code ?? "");
    const msg = String((error as Error)?.message ?? "");
    if (code === "failed-precondition" || msg.includes("index")) {
      const snap = await getDocs(col);
      rows = snap.docs.map((d) => toDoc(uid, { id: d.id, data: () => d.data() }));
      rows.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    } else {
      throw error;
    }
  }

  if (opts?.status && opts.status !== "all") {
    rows = rows.filter((r) => r.status === opts.status);
  }
  return rows;
}

export async function getUserEquipment(uid: string, equipmentId: string): Promise<UserEquipmentDoc | null> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const snap = await getDoc(doc(db, userEquipmentItemPath(uid, equipmentId)));
  if (!snap.exists()) return null;
  return toDoc(uid, { id: snap.id, data: () => snap.data() });
}

export async function createUserEquipment(uid: string, data: CreateUserEquipmentInput): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const ref = await addDoc(collection(db, userEquipmentPath(uid)), {
    ownerId: uid,
    name: data.name.trim(),
    category: data.category,
    kind: data.kind?.trim() || null,
    model: data.model?.trim() || null,
    serialNumber: data.serialNumber?.trim() || null,
    internalCode: data.internalCode?.trim() || null,
    locationText: data.locationText?.trim() || null,
    notes: data.notes?.trim() || null,
    status: data.status ?? "available",
    assignedProjectId: null,
    assignedToUserId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateUserEquipment(
  uid: string,
  equipmentId: string,
  patch: UpdateUserEquipmentInput
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.name !== undefined) updateData.name = patch.name.trim();
  if (patch.category !== undefined) updateData.category = patch.category;
  if (patch.kind !== undefined) updateData.kind = patch.kind?.trim() || null;
  if (patch.model !== undefined) updateData.model = patch.model?.trim() || null;
  if (patch.serialNumber !== undefined) updateData.serialNumber = patch.serialNumber?.trim() || null;
  if (patch.internalCode !== undefined) updateData.internalCode = patch.internalCode?.trim() || null;
  if (patch.locationText !== undefined) updateData.locationText = patch.locationText?.trim() || null;
  if (patch.notes !== undefined) updateData.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) updateData.status = patch.status;
  if (patch.photoUrl !== undefined) updateData.photoUrl = patch.photoUrl;
  if (patch.photoPath !== undefined) updateData.photoPath = patch.photoPath;
  if (patch.assignedProjectId !== undefined) updateData.assignedProjectId = patch.assignedProjectId || null;
  if (patch.assignedToUserId !== undefined) updateData.assignedToUserId = patch.assignedToUserId || null;
  await updateDoc(doc(db, userEquipmentItemPath(uid, equipmentId)), updateData);
}

export async function deleteUserEquipment(uid: string, equipmentId: string): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  await deleteDoc(doc(db, userEquipmentItemPath(uid, equipmentId)));
}

/** List equipment for the currently signed-in user. */
export async function listMyEquipment(
  opts?: { status?: UserEquipmentStatus | "all" }
): Promise<UserEquipmentDoc[]> {
  const uid = requireAuthUid();
  return listUserEquipment(uid, opts);
}

export async function createMyEquipment(data: CreateUserEquipmentInput): Promise<string> {
  const uid = requireAuthUid();
  return createUserEquipment(uid, data);
}

export async function updateMyEquipment(equipmentId: string, patch: UpdateUserEquipmentInput): Promise<void> {
  const uid = requireAuthUid();
  return updateUserEquipment(uid, equipmentId, patch);
}

export async function deleteMyEquipment(equipmentId: string): Promise<void> {
  const uid = requireAuthUid();
  return deleteUserEquipment(uid, equipmentId);
}

export async function getMyEquipment(equipmentId: string): Promise<UserEquipmentDoc | null> {
  const uid = requireAuthUid();
  return getUserEquipment(uid, equipmentId);
}

/** Set project assignment and align status to assigned / available when unassigned. */
export async function setUserEquipmentProjectAssignment(
  uid: string,
  equipmentId: string,
  projectId: string | null
): Promise<void> {
  if (projectId) {
    await updateUserEquipment(uid, equipmentId, {
      assignedProjectId: projectId,
      status: "assigned",
    });
  } else {
    await updateUserEquipment(uid, equipmentId, {
      assignedProjectId: null,
      status: "available",
    });
  }
}

export async function setMyEquipmentProjectAssignment(
  equipmentId: string,
  projectId: string | null
): Promise<void> {
  const uid = requireAuthUid();
  return setUserEquipmentProjectAssignment(uid, equipmentId, projectId);
}
