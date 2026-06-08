/**
 * Service rules on user equipment — Firestore:
 * users/{uid}/equipment/{equipmentId}/serviceRules/{ruleId}
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
import { computeNextDueAt } from "@/lib/computeNextDueAt";
import type {
  CreateServiceRuleInput,
  ServiceRuleDoc,
  ServiceRuleStatus,
} from "@/services/equipment/serviceRulesTypes";

function rulesCol(uid: string, equipmentId: string) {
  return `users/${uid}/equipment/${equipmentId}/serviceRules`;
}

function ruleDoc(uid: string, equipmentId: string, ruleId: string) {
  return `${rulesCol(uid, equipmentId)}/${ruleId}`;
}

function toIso(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function toServiceRuleDoc(
  equipmentId: string,
  snap: { id: string; data: () => Record<string, unknown> }
): ServiceRuleDoc {
  const d = snap.data();
  return {
    id: snap.id,
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
    status: (d.status as ServiceRuleStatus) ?? "active",
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

function requireAuthUid(): string {
  const uid = getAuthInstance()?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

export async function createUserEquipmentServiceRule(
  ownerUid: string,
  equipmentId: string,
  data: CreateServiceRuleInput
): Promise<ServiceRuleDoc> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const baseDate = data.startFrom ?? new Date();
  const nextDueAt = computeNextDueAt(baseDate, data.intervalUnit, data.intervalValue);

  const ref = await addDoc(collection(db, rulesCol(ownerUid, equipmentId)), {
    ownerUid,
    equipmentId,
    projectId: null,
    title: data.title.trim(),
    intervalUnit: data.intervalUnit,
    intervalValue: data.intervalValue,
    startFrom: Timestamp.fromDate(baseDate),
    nextDueAt: Timestamp.fromDate(nextDueAt),
    lastServiceAt: null,
    lastGeneratedDueAt: null,
    checklistTemplate: data.checklistTemplate ?? [],
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Failed to create service rule");
  return toServiceRuleDoc(equipmentId, { id: snap.id, data: () => snap.data() });
}

export async function listUserEquipmentServiceRules(
  ownerUid: string,
  equipmentId: string,
  opts?: { status?: ServiceRuleStatus }
): Promise<ServiceRuleDoc[]> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const col = collection(db, rulesCol(ownerUid, equipmentId));
  const q = opts?.status ? query(col, where("status", "==", opts.status)) : col;
  const snap = await getDocs(q);
  return snap.docs.map((d) => toServiceRuleDoc(equipmentId, { id: d.id, data: () => d.data() }));
}

export async function getUserEquipmentServiceRule(
  ownerUid: string,
  equipmentId: string,
  ruleId: string
): Promise<ServiceRuleDoc | null> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  const snap = await getDoc(doc(db, ruleDoc(ownerUid, equipmentId, ruleId)));
  if (!snap.exists()) return null;
  return toServiceRuleDoc(equipmentId, { id: snap.id, data: () => snap.data() });
}

export async function updateUserEquipmentServiceRule(
  ownerUid: string,
  equipmentId: string,
  ruleId: string,
  patch: Partial<
    Pick<ServiceRuleDoc, "title" | "intervalUnit" | "intervalValue" | "checklistTemplate" | "status">
  > & { startFrom?: Date | string | null }
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const ref = doc(db, ruleDoc(ownerUid, equipmentId, ruleId));
  const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title !== undefined) updateData.title = patch.title.trim();
  if (patch.intervalUnit !== undefined) updateData.intervalUnit = patch.intervalUnit;
  if (patch.intervalValue !== undefined) updateData.intervalValue = patch.intervalValue;
  if (patch.checklistTemplate !== undefined) updateData.checklistTemplate = patch.checklistTemplate;
  if (patch.status !== undefined) updateData.status = patch.status;
  if (patch.startFrom !== undefined) {
    const d = patch.startFrom instanceof Date ? patch.startFrom : new Date(patch.startFrom ?? Date.now());
    updateData.startFrom = Timestamp.fromDate(d);
  }

  const needsRecompute =
    patch.intervalUnit !== undefined || patch.intervalValue !== undefined || patch.startFrom !== undefined;
  if (needsRecompute) {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data();
      const intervalUnit = (patch.intervalUnit ?? d.intervalUnit) as "weeks" | "months";
      const intervalValue = (patch.intervalValue ?? d.intervalValue) as number;
      let baseDate: Date;
      if (patch.startFrom !== undefined) {
        baseDate = patch.startFrom instanceof Date ? patch.startFrom : new Date(patch.startFrom ?? Date.now());
      } else if (d.startFrom && typeof (d.startFrom as { toDate?: unknown }).toDate === "function") {
        baseDate = (d.startFrom as { toDate: () => Date }).toDate();
      } else {
        baseDate = new Date();
      }
      const nextDueAt = computeNextDueAt(baseDate, intervalUnit, intervalValue);
      updateData.nextDueAt = Timestamp.fromDate(nextDueAt);
    }
  }

  await updateDoc(ref, updateData);
}

export async function listMyEquipmentServiceRules(
  equipmentId: string,
  opts?: { status?: ServiceRuleStatus }
): Promise<ServiceRuleDoc[]> {
  const uid = requireAuthUid();
  return listUserEquipmentServiceRules(uid, equipmentId, opts);
}

export async function createMyEquipmentServiceRule(
  equipmentId: string,
  data: CreateServiceRuleInput
): Promise<ServiceRuleDoc> {
  const uid = requireAuthUid();
  return createUserEquipmentServiceRule(uid, equipmentId, data);
}

export async function getMyEquipmentServiceRule(
  equipmentId: string,
  ruleId: string
): Promise<ServiceRuleDoc | null> {
  const uid = requireAuthUid();
  return getUserEquipmentServiceRule(uid, equipmentId, ruleId);
}

export async function updateMyEquipmentServiceRule(
  equipmentId: string,
  ruleId: string,
  patch: Parameters<typeof updateUserEquipmentServiceRule>[3]
): Promise<void> {
  const uid = requireAuthUid();
  return updateUserEquipmentServiceRule(uid, equipmentId, ruleId, patch);
}
