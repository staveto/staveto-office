/**
 * Company/personal catalog of custom quote items ("Vlastné položky").
 *
 * The user builds a reusable price list — own PRODUCTS (material with a
 * selling price) and WORKS (labor positions) — and later inserts them into
 * quotes with one click. Catalog items are templates: inserting one copies
 * name/unit/price into the quote, it never links back.
 *
 * Firestore: workspaces/{wsKey}/catalogItems/{itemId}
 *  - wsKey = uid (personal) or orgId (company) via getWorkspaceStorageKey,
 *    so the whole team shares one catalog in a company workspace.
 */

import {
  getFirestoreInstance,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from "@/lib/firebase";
import type { MaterialCategory, MaterialUnit } from "./types";

export type CatalogItemKind = "product" | "work";

export type CatalogItemDoc = {
  id: string;
  /** Workspace storage key the item belongs to (uid or orgId). */
  workspaceKey: string;
  kind: CatalogItemKind;
  name: string;
  description?: string;
  unit: MaterialUnit;
  /** Selling price per unit (what lands in the quote). */
  unitPrice: number;
  currency: string;
  category?: MaterialCategory;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type CreateCatalogItemInput = {
  kind: CatalogItemKind;
  name: string;
  description?: string;
  unit: MaterialUnit;
  unitPrice: number;
  currency?: string;
  category?: MaterialCategory;
};

function requireDb() {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");
  return db;
}

function newId(): string {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as T;
}

export async function listCatalogItems(workspaceKey: string): Promise<CatalogItemDoc[]> {
  const db = requireDb();
  const snap = await getDocs(collection(db, "workspaces", workspaceKey, "catalogItems"));
  const items = snap.docs.map((d) => ({ ...(d.data() as CatalogItemDoc), id: d.id }));
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

export async function createCatalogItem(
  workspaceKey: string,
  userId: string,
  input: CreateCatalogItemInput
): Promise<CatalogItemDoc> {
  const db = requireDb();
  const now = new Date().toISOString();
  const item: CatalogItemDoc = stripUndefined({
    id: newId(),
    workspaceKey,
    kind: input.kind,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    unit: input.unit,
    unitPrice: input.unitPrice >= 0 ? input.unitPrice : 0,
    currency: input.currency ?? "EUR",
    category: input.category,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });
  await setDoc(doc(db, "workspaces", workspaceKey, "catalogItems", item.id), item);
  return item;
}

export async function updateCatalogItem(
  workspaceKey: string,
  itemId: string,
  patch: Partial<Pick<CatalogItemDoc, "kind" | "name" | "description" | "unit" | "unitPrice" | "currency" | "category">>
): Promise<void> {
  const db = requireDb();
  await updateDoc(doc(db, "workspaces", workspaceKey, "catalogItems", itemId), {
    ...stripUndefined(patch),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCatalogItem(
  workspaceKey: string,
  itemId: string
): Promise<void> {
  const db = requireDb();
  await deleteDoc(doc(db, "workspaces", workspaceKey, "catalogItems", itemId));
}
