/**
 * Organization company profile for documents (quotes, exports).
 * Stored additively on organizations/{orgId}.profile — no new collections.
 */
import { getFirestoreInstance, doc, getDoc, setDoc, serverTimestamp, getCallable } from "./firebase";
import type { Organization } from "./organizations";
import { mergeOrganizationIntoProfile } from "./companyProfileCompletion";
import type { OrganizationMarketProfile } from "./market/marketProfileContract";
import { buildOrganizationMarketFields } from "./market/companyMarketConfig";
import { isSupportedCountryCode, resolveSupportedCountryCode } from "./market/countryOptions";

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
  contactName?: string;
  websiteUrl?: string;
  bankAccount?: string;
  logoUrl?: string;
  logoStoragePath?: string;
};

export type OrganizationProfileInput = OrganizationProfile & {
  /** Canonical ISO country code for company market (SK/CZ/DE/AT/CH). */
  countryCode?: string | null;
};

export type OrganizationPrintInfo = {
  orgId: string;
  name: string;
  profile: OrganizationProfile | null;
  market: OrganizationMarketProfile;
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
    "contactName",
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

function parseTaxProfile(raw: unknown): OrganizationMarketProfile["taxProfile"] {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    countryCode: pickString(p, ["countryCode"]),
    taxLabel: pickString(p, ["taxLabel"]),
    vatLabel: pickString(p, ["vatLabel"]),
    vatMode:
      p.vatMode === "auto" || p.vatMode === "with_vat" || p.vatMode === "without_vat"
        ? p.vatMode
        : undefined,
    complianceStatus: "needs_legal_review",
  };
}

function parseLegalProfile(raw: unknown): OrganizationMarketProfile["legalProfile"] {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const requiredFields = Array.isArray(p.requiredFields)
    ? p.requiredFields.filter((v): v is string => typeof v === "string")
    : undefined;
  const optionalFields = Array.isArray(p.optionalFields)
    ? p.optionalFields.filter((v): v is string => typeof v === "string")
    : undefined;
  return {
    countryCode: pickString(p, ["countryCode"]),
    companyRegistrationNumberLabel: pickString(p, ["companyRegistrationNumberLabel"]),
    taxIdLabel: pickString(p, ["taxIdLabel"]),
    vatIdLabel: pickString(p, ["vatIdLabel"]),
    requiredFields,
    optionalFields,
    complianceStatus: "needs_legal_review",
  };
}

export function parseOrganizationMarketFields(
  data: Record<string, unknown>
): OrganizationMarketProfile {
  return {
    countryCode:
      typeof data.countryCode === "string" ? data.countryCode.trim() || null : null,
    currency: typeof data.currency === "string" ? data.currency.trim() || null : null,
    timezone: typeof data.timezone === "string" ? data.timezone.trim() || null : null,
    locale: typeof data.locale === "string" ? data.locale.trim() || null : null,
    defaultLanguage:
      typeof data.defaultLanguage === "string" ? data.defaultLanguage.trim() || null : null,
    taxProfile: parseTaxProfile(data.taxProfile),
    legalProfile: parseLegalProfile(data.legalProfile),
    marketConfigVersion:
      typeof data.marketConfigVersion === "number" ? data.marketConfigVersion : null,
  };
}

export function resolveOrganizationCountryCode(
  data: Record<string, unknown>,
  profile: OrganizationProfile | null
): string | null {
  const market = parseOrganizationMarketFields(data);
  return resolveSupportedCountryCode(
    market.countryCode,
    profile?.country ?? (typeof data.country === "string" ? data.country : null)
  );
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
    const profile = mergeOrganizationIntoProfile(data);
    return {
      orgId,
      name: typeof data.name === "string" ? data.name.trim() || orgId : orgId,
      profile,
      market: parseOrganizationMarketFields(data),
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

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function writeOrganizationProfile(
  orgId: string,
  input: OrganizationProfileInput
): Promise<void> {
  const resolvedCountry = resolveSupportedCountryCode(
    input.countryCode,
    input.country
  );
  const profilePayload = organizationProfileToFirestore({
    ...input,
    country: resolvedCountry ?? input.country?.trim() ?? undefined,
  });

  const callable = getCallable<
    {
      orgId: string;
      legalName?: string;
      billingEmail?: string | null;
      contactName?: string | null;
      phone?: string | null;
      countryCode?: string | null;
      billingAddress?: {
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        zip?: string | null;
      };
      companyIdentifiers?: {
        registrationNumber?: string | null;
        taxId?: string | null;
        vatId?: string | null;
      };
      profile?: Record<string, string | null | undefined>;
    },
    { ok: true }
  >("updateBusinessOrgProfile");

  await callable({
    orgId,
    legalName: input.legalName?.trim() || undefined,
    billingEmail: trimOrNull(input.email),
    contactName: trimOrNull(input.contactName),
    phone: trimOrNull(input.phone),
    countryCode: resolvedCountry,
    billingAddress: {
      line1: trimOrNull(input.addressText),
      city: trimOrNull(input.city),
      zip: trimOrNull(input.zip),
    },
    companyIdentifiers: {
      registrationNumber: trimOrNull(input.registrationNumber),
      taxId: trimOrNull(input.taxId),
      vatId: trimOrNull(input.vatId),
    },
    profile: profilePayload,
  });
}

/** Safe merge of canonical organization market fields on save. */
export async function writeOrganizationMarketFields(
  orgId: string,
  userId: string,
  countryCode: string | null | undefined
): Promise<OrganizationMarketProfile | null> {
  if (!countryCode?.trim() || !isSupportedCountryCode(countryCode)) {
    return null;
  }

  const marketFields = buildOrganizationMarketFields(countryCode);
  if (!marketFields) return null;

  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  await setDoc(
    doc(db, "organizations", orgId),
    {
      ...marketFields,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    },
    { merge: true }
  );

  return marketFields;
}

export async function writeCompanyProfileSettings(
  orgId: string,
  userId: string,
  input: OrganizationProfileInput
): Promise<OrganizationPrintInfo | null> {
  await writeOrganizationProfile(orgId, input);

  const resolvedCountry = resolveSupportedCountryCode(input.countryCode, input.country);
  if (resolvedCountry) {
    await writeOrganizationMarketFields(orgId, userId, resolvedCountry);
  }

  return readOrganizationProfile(orgId);
}

/** Logo-only patch still uses direct merge for storage metadata fields. */
export async function patchOrganizationProfileFields(
  orgId: string,
  input: Partial<OrganizationProfileInput>
): Promise<void> {
  const db = getFirestoreInstance();
  if (!db) throw new Error("Firestore not configured");

  const payload: Record<string, unknown> = {
    profile: organizationProfileToFirestore(input),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "organizations", orgId), payload, { merge: true });
}
