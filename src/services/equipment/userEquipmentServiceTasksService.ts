/**
 * Service tasks on user equipment — Firestore:
 * users/{uid}/equipment/{equipmentId}/serviceTasks/{taskId}
 */
import {
  getFirestoreInstance,
  getAuthInstance,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "@/lib/firebase";
import type { ServiceRuleDoc, UserEquipmentServiceTaskDoc } from "@/services/equipment/serviceRulesTypes";

function tasksCol(uid: string, equipmentId: string) {
  return `users/${uid}/equipment/${equipmentId}/serviceTasks`;
}

function taskDoc(uid: string, equipmentId: string, taskId: string) {
  return `${tasksCol(uid, equipmentId)}/${taskId}`;
}

function toTaskDoc(snap: { id: string; data: () => Record<string, unknown> }): UserEquipmentServiceTaskDoc {
  const d = snap.data();
  const toIso = (v: unknown) => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function") {
      return (v as { toDate: () => Date }).toDate().toISOString();
    }
    return String(v);
  };
  return {
    id: snap.id,
    title: (d.title as string) ?? "",
    status: String(d.status ?? "OPEN").toUpperCase(),
    dueDate: (d.dueDate as string) ?? null,
    serviceRuleId: (d.serviceRuleId as string) ?? null,
    subtasks: (d.subtasks as UserEquipmentServiceTaskDoc["subtasks"]) ?? [],
    isActive: d.isActive !== false,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

function requireAuthUid(): string {
  const uid = getAuthInstance()?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

export async function listUserEquipmentServiceTasks(
  ownerUid: string,
  equipmentId: string,
  opts?: { status?: "OPEN" | "DONE" | "all" }
): Promise<UserEquipmentServiceTaskDoc[]> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const col = collection(db, tasksCol(ownerUid, equipmentId));
  const q =
    opts?.status && opts.status !== "all" ? query(col, where("status", "==", opts.status)) : col;
  const snap = await getDocs(q);
  return snap.docs.map((d) => toTaskDoc({ id: d.id, data: () => d.data() }));
}

export async function createUserEquipmentServiceTaskFromRule(
  ownerUid: string,
  equipmentId: string,
  rule: ServiceRuleDoc,
  dueAt: Date
): Promise<string> {
  const uid = requireAuthUid();
  if (uid !== ownerUid) throw new Error("Permission denied");

  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const dueDateStr = dueAt.toISOString().split("T")[0];
  const subtasks = (rule.checklistTemplate ?? []).map((item, index) => ({
    id: item.id,
    title: item.title,
    done: false,
    order: index,
  }));

  const ref = await addDoc(collection(db, tasksCol(ownerUid, equipmentId)), {
    ownerId: ownerUid,
    equipmentId,
    title: rule.title,
    status: "OPEN",
    serviceRuleId: rule.id,
    subtasks,
    dueDate: dueDateStr,
    isActive: true,
    doneAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateUserEquipmentServiceTaskStatus(
  ownerUid: string,
  equipmentId: string,
  taskId: string,
  status: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const upper = status.toUpperCase();
  await updateDoc(doc(db, taskDoc(ownerUid, equipmentId, taskId)), {
    status: upper,
    updatedAt: serverTimestamp(),
    doneAt: upper === "DONE" ? serverTimestamp() : null,
  });
}

async function runUserEquipmentServiceAutoNextOnDone(params: {
  ownerUid: string;
  equipmentId: string;
  serviceRuleId: string;
}): Promise<void> {
  const { ownerUid, equipmentId, serviceRuleId } = params;
  const db = getFirestoreInstance();
  if (!db) return;

  const ruleRef = doc(db, `users/${ownerUid}/equipment/${equipmentId}/serviceRules/${serviceRuleId}`);
  const ruleSnap = await getDoc(ruleRef);
  if (!ruleSnap.exists()) return;

  const d = ruleSnap.data();
  const toIso = (v: unknown) => {
    if (!v) return "";
    if (typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function") {
      return (v as { toDate: () => Date }).toDate().toISOString();
    }
    return String(v);
  };

  const rule: ServiceRuleDoc = {
    id: ruleSnap.id,
    projectId: (d.projectId as string) || "",
    equipmentId: (d.equipmentId as string) || equipmentId,
    title: (d.title as string) ?? "",
    intervalUnit: (d.intervalUnit as "weeks" | "months") ?? "weeks",
    intervalValue: (d.intervalValue as number) ?? 1,
    startFrom: d.startFrom ? toIso(d.startFrom) : null,
    nextDueAt: toIso(d.nextDueAt),
    lastServiceAt: d.lastServiceAt ? toIso(d.lastServiceAt) : null,
    lastGeneratedDueAt: d.lastGeneratedDueAt ? toIso(d.lastGeneratedDueAt) : null,
    checklistTemplate: (d.checklistTemplate as Array<{ id: string; title: string }>) ?? [],
    status: (d.status as ServiceRuleDoc["status"]) ?? "active",
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };

  if (rule.status !== "active") return;

  const { computeNextDueAt } = await import("@/lib/computeNextDueAt");
  const baseDate = new Date();
  const computedNext = computeNextDueAt(baseDate, rule.intervalUnit, rule.intervalValue);
  const computedNextStr = computedNext.toISOString().split("T")[0];

  if (rule.lastGeneratedDueAt) {
    const lastGenStr = rule.lastGeneratedDueAt.split("T")[0];
    if (lastGenStr === computedNextStr) return;
  }

  const openTasks = await listUserEquipmentServiceTasks(ownerUid, equipmentId, { status: "OPEN" });
  const duplicate = openTasks.some(
    (t) => t.serviceRuleId === serviceRuleId && (t.dueDate ?? "").trim() === computedNextStr
  );
  if (duplicate) return;

  await updateDoc(ruleRef, {
    lastServiceAt: Timestamp.fromDate(baseDate),
    nextDueAt: Timestamp.fromDate(computedNext),
    lastGeneratedDueAt: Timestamp.fromDate(computedNext),
    updatedAt: serverTimestamp(),
  });

  await createUserEquipmentServiceTaskFromRule(ownerUid, equipmentId, rule, computedNext);
}

export async function completeUserEquipmentServiceTask(
  ownerUid: string,
  equipmentId: string,
  taskId: string
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, taskDoc(ownerUid, equipmentId, taskId));
  const snap = await getDoc(ref);
  let serviceRuleId: string | undefined;
  if (snap.exists()) {
    serviceRuleId = (snap.data() as { serviceRuleId?: string }).serviceRuleId;
  }

  await updateUserEquipmentServiceTaskStatus(ownerUid, equipmentId, taskId, "DONE");

  if (serviceRuleId) {
    try {
      await runUserEquipmentServiceAutoNextOnDone({ ownerUid, equipmentId, serviceRuleId });
    } catch {
      /* non-fatal */
    }
  }
}

export async function listMyEquipmentServiceTasks(
  equipmentId: string,
  opts?: { status?: "OPEN" | "DONE" | "all" }
): Promise<UserEquipmentServiceTaskDoc[]> {
  const uid = requireAuthUid();
  return listUserEquipmentServiceTasks(uid, equipmentId, opts);
}

export async function completeMyEquipmentServiceTask(
  equipmentId: string,
  taskId: string
): Promise<void> {
  const uid = requireAuthUid();
  return completeUserEquipmentServiceTask(uid, equipmentId, taskId);
}

export async function createMyEquipmentServiceTaskFromRule(
  equipmentId: string,
  rule: ServiceRuleDoc,
  dueAt: Date
): Promise<string> {
  const uid = requireAuthUid();
  return createUserEquipmentServiceTaskFromRule(uid, equipmentId, rule, dueAt);
}
