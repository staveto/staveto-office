/**
 * Organization service — slug / tenant fields (additive, optional on documents).
 */
import {
  getFirestoreInstance,
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  query,
  where,
  limit,
  serverTimestamp,
} from "@/lib/firebase";
import type { Organization, OrgMemberRole } from "@/lib/organizations";
import {
  normalizeWorkspaceSlug,
  validateWorkspaceSlug,
  buildSubdomainPreviewUrl,
} from "@/lib/workspaceSlug";

export type OrganizationWithId = Organization & { id: string };

export type OrganizationSlugFields = {
  slug?: string;
  domain?: string;
  subdomainEnabled?: boolean;
  slugUpdatedAt?: unknown;
  slugUpdatedBy?: string;
};

export type OrganizationRecord = Organization & OrganizationSlugFields;

/** Extend base organization type with optional tenant fields. */
export type { Organization };

export async function getOrganizationBySlug(
  slug: string
): Promise<OrganizationWithId | null> {
  const db = getFirestoreInstance();
  if (!db) return null;

  const normalized = normalizeWorkspaceSlug(slug);
  if (!normalized) return null;

  const q = query(
    collection(db, "organizations"),
    where("slug", "==", normalized),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const orgDoc = snap.docs[0];
  return { id: orgDoc.id, ...(orgDoc.data() as OrganizationRecord) };
}

export async function isOrganizationSlugAvailable(
  slug: string,
  excludeOrgId?: string
): Promise<boolean> {
  const existing = await getOrganizationBySlug(slug);
  if (!existing) return true;
  if (excludeOrgId && existing.id === excludeOrgId) return true;
  return false;
}

export async function isOrganizationMember(
  orgId: string,
  uid: string
): Promise<{ member: boolean; role?: OrgMemberRole }> {
  const db = getFirestoreInstance();
  if (!db) return { member: false };

  const orgSnap = await getDoc(doc(db, "organizations", orgId));
  if (orgSnap.exists()) {
    const org = orgSnap.data() as Organization;
    if (org.ownerUid === uid) {
      return { member: true, role: "admin" };
    }
  }

  const memberSnap = await getDoc(doc(db, "organizations", orgId, "members", uid));
  if (!memberSnap.exists()) return { member: false };

  const data = memberSnap.data() as { status?: string; role?: OrgMemberRole };
  if (data.status === "removed") return { member: false };
  return { member: true, role: data.role };
}

export async function updateOrganizationSlug(
  orgId: string,
  slugInput: string,
  userId: string
): Promise<{ slug: string; domain: string }> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const validation = validateWorkspaceSlug(slugInput);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const slug = validation.slug;
  const available = await isOrganizationSlugAvailable(slug, orgId);
  if (!available) {
    throw new Error("This subdomain is already taken.");
  }

  const baseDomain =
    process.env.NEXT_PUBLIC_STAVETO_BASE_DOMAIN ?? "staveto.com";
  const domain = buildSubdomainPreviewUrl(slug, baseDomain);

  const ref = doc(db, "organizations", orgId);
  await setDoc(
    ref,
    {
      slug,
      domain,
      subdomainEnabled: true,
      slugUpdatedAt: serverTimestamp(),
      slugUpdatedBy: userId,
    },
    { merge: true }
  );

  return { slug, domain };
}

export async function getOrganizationRecord(
  orgId: string
): Promise<OrganizationWithId | null> {
  const db = getFirestoreInstance();
  if (!db) return null;
  const snap = await getDoc(doc(db, "organizations", orgId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as OrganizationRecord) };
}
