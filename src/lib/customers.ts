/**
 * Firestore customers — workspace-scoped (additive; mobile-aligned CRM).
 */
import {
  getFirestoreInstance,
  doc,
  getDoc,
  getDocs,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "./firebase";
import type { Workspace } from "./workspace-types";
import type { ActiveWorkspace } from "@/types/workspace";
import { getProjectWorkspaceWriteFields } from "@/services/workspace/workspaceService";
import { fromLegacyWorkspace } from "./workspace-types";

export type CustomerType = "person" | "company";

export type CustomerDoc = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  type: CustomerType;
  ico?: string;
  taxId?: string;
  address?: string;
  ownerId?: string;
  orgId?: string;
  workspaceType?: "personal" | "team";
  workspaceId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateCustomerInput = {
  name: string;
  email?: string;
  phone?: string;
  type: CustomerType;
  ico?: string;
  taxId?: string;
  address?: string;
};

function toCustomerDoc(id: string, data: Record<string, unknown>): CustomerDoc {
  const created = data.createdAt as { toDate?: () => Date } | string | undefined;
  const updated = data.updatedAt as { toDate?: () => Date } | string | undefined;
  return {
    id,
    name: String(data.name ?? "").trim(),
    email: data.email ? String(data.email).trim() : undefined,
    phone: data.phone ? String(data.phone).trim() : undefined,
    type: data.type === "company" ? "company" : "person",
    ico: data.ico ? String(data.ico).trim() : undefined,
    taxId: data.taxId ? String(data.taxId).trim() : undefined,
    address: data.address ? String(data.address).trim() : undefined,
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
    orgId: data.orgId ? String(data.orgId) : undefined,
    workspaceType: data.workspaceType as CustomerDoc["workspaceType"],
    workspaceId: data.workspaceId ? String(data.workspaceId) : undefined,
    createdAt:
      typeof created === "string"
        ? created
        : created?.toDate?.()
          ? created.toDate().toISOString()
          : undefined,
    updatedAt:
      typeof updated === "string"
        ? updated
        : updated?.toDate?.()
          ? updated.toDate().toISOString()
          : undefined,
  };
}

function normalizeKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function toActiveWorkspace(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): ActiveWorkspace {
  if ("source" in workspace && (workspace.type === "personal" || workspace.type === "company")) {
    return workspace;
  }
  return fromLegacyWorkspace(workspace as Workspace, uid);
}

export async function listCustomersForWorkspace(
  workspace: Workspace | ActiveWorkspace,
  uid: string
): Promise<CustomerDoc[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  const active = toActiveWorkspace(workspace, uid);
  const customersRef = collection(db, "customers");

  try {
    if (active.type === "personal") {
      const q = query(
        customersRef,
        where("ownerId", "==", uid),
        orderBy("name", "asc"),
        limit(200)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => toCustomerDoc(d.id, d.data() as Record<string, unknown>));
    }

    const orgId = active.orgId ?? active.id;
    const q = query(
      customersRef,
      where("orgId", "==", orgId),
      orderBy("name", "asc"),
      limit(200)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toCustomerDoc(d.id, d.data() as Record<string, unknown>));
  } catch {
    const snap = await getDocs(query(customersRef, limit(300)));
    const all = snap.docs.map((d) => toCustomerDoc(d.id, d.data() as Record<string, unknown>));
    if (active.type === "personal") {
      return all
        .filter((c) => c.ownerId === uid)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }
    const orgId = active.orgId ?? active.id;
    return all
      .filter((c) => c.orgId === orgId)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }
}

export async function getCustomer(customerId: string): Promise<CustomerDoc | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  const snap = await getDoc(doc(db, "customers", customerId));
  return snap.exists()
    ? toCustomerDoc(snap.id, snap.data() as Record<string, unknown>)
    : null;
}

export async function findDuplicateCustomer(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  input: { name: string; email?: string; phone?: string }
): Promise<CustomerDoc | null> {
  const list = await listCustomersForWorkspace(workspace, uid);
  const nameKey = normalizeKey(input.name);
  const emailKey = normalizeKey(input.email);
  const phoneKey = normalizeKey(input.phone)?.replace(/\s+/g, "");

  for (const c of list) {
    if (emailKey && normalizeKey(c.email) === emailKey) return c;
    if (phoneKey && normalizeKey(c.phone)?.replace(/\s+/g, "") === phoneKey) return c;
    if (nameKey && normalizeKey(c.name) === nameKey) return c;
  }
  return null;
}

export async function createCustomer(
  workspace: Workspace | ActiveWorkspace,
  uid: string,
  input: CreateCustomerInput
): Promise<string> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const name = input.name.trim();
  if (!name) throw new Error("Customer name is required");

  const active = toActiveWorkspace(workspace, uid);
  const duplicate = await findDuplicateCustomer(workspace, uid, input);
  if (duplicate) return duplicate.id;

  const ref = await addDoc(collection(db, "customers"), {
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    type: input.type,
    ico: input.ico?.trim() || null,
    taxId: input.taxId?.trim() || null,
    address: input.address?.trim() || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...getProjectWorkspaceWriteFields(active, uid),
  });

  return ref.id;
}
