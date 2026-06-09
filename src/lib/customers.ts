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
  /** Mirrors `type` when stored in Firestore. */
  customerType?: CustomerType;
  companyName?: string;
  contactPersonName?: string;
  ico?: string;
  taxId?: string;
  vatId?: string;
  address?: string;
  addressText?: string;
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
  companyName?: string;
  contactPersonName?: string;
  ico?: string;
  taxId?: string;
  vatId?: string;
  address?: string;
  addressText?: string;
};

function toCustomerDoc(id: string, data: Record<string, unknown>): CustomerDoc {
  const created = data.createdAt as { toDate?: () => Date } | string | undefined;
  const updated = data.updatedAt as { toDate?: () => Date } | string | undefined;
  const type: CustomerType =
    data.customerType === "company" || data.type === "company" ? "company" : "person";
  const addressRaw =
    (typeof data.addressText === "string" ? data.addressText : undefined) ||
    (typeof data.address === "string" ? data.address : undefined);
  const vatRaw =
    (typeof data.vatId === "string" ? data.vatId : undefined) ||
    (typeof data.taxId === "string" ? data.taxId : undefined);

  return {
    id,
    name: String(data.name ?? "").trim(),
    email: data.email ? String(data.email).trim() : undefined,
    phone: data.phone ? String(data.phone).trim() : undefined,
    type,
    customerType: data.customerType === "company" || data.customerType === "person"
      ? data.customerType
      : type,
    companyName: data.companyName ? String(data.companyName).trim() : undefined,
    contactPersonName: data.contactPersonName
      ? String(data.contactPersonName).trim()
      : undefined,
    ico: data.ico ? String(data.ico).trim() : undefined,
    taxId: vatRaw ? String(vatRaw).trim() : undefined,
    vatId: vatRaw ? String(vatRaw).trim() : undefined,
    address: addressRaw ? String(addressRaw).trim() : undefined,
    addressText: addressRaw ? String(addressRaw).trim() : undefined,
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

function sortCustomersByName(list: CustomerDoc[]): CustomerDoc[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

function isMissingIndexError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  const message = String((err as { message?: string })?.message ?? "").toLowerCase();
  return (
    code === "failed-precondition" ||
    message.includes("index") ||
    message.includes("requires an index")
  );
}

async function queryCustomers(
  customersRef: ReturnType<typeof collection>,
  filters: Parameters<typeof query>[1][],
  withOrderBy: boolean
): Promise<CustomerDoc[]> {
  const constraints = [...filters, ...(withOrderBy ? [orderBy("name", "asc")] : []), limit(200)];
  const snap = await getDocs(query(customersRef, ...constraints));
  return snap.docs.map((d) => toCustomerDoc(d.id, d.data() as Record<string, unknown>));
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
      try {
        return await queryCustomers(customersRef, [where("ownerId", "==", uid)], true);
      } catch (err) {
        if (!isMissingIndexError(err)) throw err;
        return sortCustomersByName(
          await queryCustomers(customersRef, [where("ownerId", "==", uid)], false)
        );
      }
    }

    const orgId = active.orgId ?? active.id;
    try {
      return await queryCustomers(customersRef, [where("orgId", "==", orgId)], true);
    } catch (err) {
      if (!isMissingIndexError(err)) throw err;
      return sortCustomersByName(
        await queryCustomers(customersRef, [where("orgId", "==", orgId)], false)
      );
    }
  } catch {
    return [];
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
  input: {
    name: string;
    type?: CustomerType;
    companyName?: string;
    email?: string;
    phone?: string;
  }
): Promise<CustomerDoc | null> {
  const list = await listCustomersForWorkspace(workspace, uid);
  const nameKey = normalizeKey(input.name);
  const companyKey = normalizeKey(input.companyName);
  const emailKey = normalizeKey(input.email);
  const phoneKey = normalizeKey(input.phone)?.replace(/\s+/g, "");

  for (const c of list) {
    if (emailKey && normalizeKey(c.email) === emailKey) return c;
    if (phoneKey && normalizeKey(c.phone)?.replace(/\s+/g, "") === phoneKey) return c;
    if (companyKey && normalizeKey(c.companyName) === companyKey) return c;
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
  if (input.type === "company" && !input.contactPersonName?.trim()) {
    throw new Error("Contact person is required for company customers");
  }

  const active = toActiveWorkspace(workspace, uid);
  const duplicate = await findDuplicateCustomer(workspace, uid, input);
  if (duplicate) return duplicate.id;

  const addressText = (input.addressText ?? input.address)?.trim() || null;
  const vatId = (input.vatId ?? input.taxId)?.trim() || null;
  const companyName =
    input.type === "company" ? (input.companyName?.trim() || name) : null;
  const contactPersonName =
    input.type === "company" ? input.contactPersonName?.trim() || null : null;

  const ref = await addDoc(collection(db, "customers"), {
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    type: input.type,
    customerType: input.type,
    companyName,
    contactPersonName,
    ico: input.ico?.trim() || null,
    taxId: vatId,
    vatId,
    address: addressText,
    addressText,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...getProjectWorkspaceWriteFields(active, uid),
  });

  return ref.id;
}
