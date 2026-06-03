/**
 * Organization company profile for documents (quotes, exports).
 * Stored additively on organizations/{orgId}.profile — no new collections.
 */
import { getFirestoreInstance, doc, getDoc, setDoc, serverTimestamp } from "./firebase";
import type { Organization } from "./organizations";

export type OrganizationProfile = {
  legalName?: string;
  addressText?: string;
  city?: string;
  zip?: string;
  country?: string;
  registrationNumber?: string;
  taxId?: string;
  vatId?: string;
  phone?: string;
  email?: string;
  websiteUrl?: string;
  bankAccount?: string;
  logoUrl?: string;
  logoStoragePath?: string;
};

export type OrganizationProfileInput = OrganizationProfile;

export type OrganizationPrintInfo = {
  orgId: string;
  name: string;
  profile: OrganizationProfile | null;
};

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function parseOrganizationProfile(data: Record<string, unknown>): OrganizationProfile | null {
  const raw = data.profile;
  if (!raw || typeof raw !== "object") return null;

  const p = raw as Record<string, unknown>;
  const parsed: OrganizationProfile = {
    legalName: pickString(p, ["legalName", "companyLegalName"]),
    addressText: pickString(p, ["addressText", "address", "street"]),
    city: pickString(p, ["city"]),
    zip: pickString(p, ["zip", "postalCode", "postCode"]),
    country: pickString(p, ["country", "countryCode"]),
    registrationNumber: pickString(p, ["registrationNumber", "ico", "companyId"]),
    taxId: pickString(p, ["taxId", "dic"]),
    vatId: pickString(p, ["vatId", "icDph", "vatNumber"]),
    phone: pickString(p, ["phone", "contactPhone"]),
    email: pickString(p, ["email", "contactEmail"]),
    websiteUrl: pickString(p, ["websiteUrl", "website"]),
    bankAccount: pickString(p, ["bankAccount", "iban", "bankIban"]),
    logoUrl: pickString(p, ["logoUrl"]),
    logoStoragePath: pickString(p, ["logoStoragePath"]),
  };

  return hasOrganizationProfileData(parsed) ? parsed : null;
}

export function hasOrganizationProfileData(profile: OrganizationProfile): boolean {
  return Object.entries(profile).some(
    ([key, value]) => key !== "logoStoragePath" && Boolean(value?.trim?.() ?? value)
  );
}

export function getOrganizationDisplayName(info: OrganizationPrintInfo): string {
  return info.profile?.legalName?.trim() || info.name.trim();
}

/** Single-line postal address for documents. */
export function formatOrganizationAddress(profile: OrganizationProfile | null | undefined): string | undefined {
  if (!profile) return undefined;

  const line1 = profile.addressText?.trim();
  const cityLine = [profile.zip?.trim(), profile.city?.trim()].filter(Boolean).join(" ");
  const parts = [line1, cityLine, profile.country?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

export function organizationProfileToFirestore(
  input: OrganizationProfileInput
): Record<string, string | null> {
  const fields: (keyof OrganizationProfile)[] = [
    "legalName",
    "addressText",
    "city",
    "zip",
    "country",
    "registrationNumber",
    "taxId",
    "vatId",
    "phone",
    "email",
    "websiteUrl",
    "bankAccount",
    "logoUrl",
    "logoStoragePath",
  ];

  const out: Record<string, string | null> = {};
  for (const key of fields) {
    const value = input[key]?.trim();
    out[key] = value ? value : null;
  }
  return out;
}

export async function getOrganizationForQuotePrint(
  orgId: string
): Promise<OrganizationPrintInfo | null> {
  const db = getFirestoreInstance();
  if (!db) return null;

  try {
    const snap = await getDoc(doc(db, "organizations", orgId));
    if (!snap.exists()) return null;

    const data = snap.data() as Record<string, unknown> & Organization;
    return {
      orgId,
      name: typeof data.name === "string" ? data.name.trim() || orgId : orgId,
      profile: parseOrganizationProfile(data),
    };
  } catch {
    return null;
  }
}

export async function readOrganizationProfile(
  orgId: string
): Promise<OrganizationPrintInfo | null> {
  return getOrganizationForQuotePrint(orgId);
}

export async function writeOrganizationProfile(
  orgId: string,
  input: OrganizationProfileInput
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const payload: Record<string, unknown> = {
    profile: organizationProfileToFirestore(input),
    updatedAt: serverTimestamp(),
  };

  const legalName = input.legalName?.trim();
  if (legalName) {
    payload.name = legalName;
  }

  await setDoc(doc(db, "organizations", orgId), payload, { merge: true });
}
