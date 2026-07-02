/**
 * Canonical organization fields used by web + mobile business compatibility.
 */
export type OrganizationBillingAddress = {
  line1?: string;
  street?: string;
  line2?: string | null;
  city?: string;
  zip?: string;
  postalCode?: string;
  country?: string;
};

export type OrganizationCompanyIdentifiers = {
  registrationNumber?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  vatNumber?: string | null;
};

export type CanonicalOrganizationRecord = {
  id?: string;
  name?: string;
  legalName?: string;
  countryCode?: string;
  country?: string;
  billingEmail?: string;
  billingAddress?: OrganizationBillingAddress | Record<string, never> | null;
  companyIdentifiers?: OrganizationCompanyIdentifiers | Record<string, never> | null;
  contactName?: string | null;
  phone?: string | null;
  planCode?: string;
  selectedPlan?: string;
  billingPeriod?: string;
  requestedSeats?: number;
  seatsLimit?: number;
  seatsUsed?: number;
  status?: string;
  billingStatus?: string;
  businessEnabled?: boolean;
  trialStartedAt?: unknown;
  trialEndsAt?: unknown;
  ownerUid?: string;
  billingOwnerUid?: string;
  createdByUid?: string;
  source?: string;
  profile?: Record<string, unknown> | null;
};

export type CompanyProfileCompletion = {
  isComplete: boolean;
  missingFields: string[];
  missingRecommendedFields: string[];
  missingOptionalFields: string[];
  completionPercent: number;
};

const RECOMMENDED_FIELDS: Array<{
  key: string;
  isFilled: (org: CanonicalOrganizationRecord) => boolean;
}> = [
  {
    key: "legalName",
    isFilled: (org) => Boolean(org.legalName?.trim() || org.name?.trim()),
  },
  {
    key: "billingEmail",
    isFilled: (org) => Boolean(org.billingEmail?.trim() || pickProfileEmail(org)),
  },
  {
    key: "countryCode",
    isFilled: (org) =>
      Boolean(org.countryCode?.trim() || org.country?.trim() || pickProfileCountry(org)),
  },
  {
    key: "billingAddress.street",
    isFilled: (org) => Boolean(normalizeBillingAddress(org).line1?.trim() || pickProfileAddress(org)),
  },
  {
    key: "billingAddress.city",
    isFilled: (org) => Boolean(normalizeBillingAddress(org).city?.trim() || pickProfileCity(org)),
  },
];

const OPTIONAL_FIELDS: Array<{
  key: string;
  isFilled: (org: CanonicalOrganizationRecord) => boolean;
}> = [
  {
    key: "phone",
    isFilled: (org) => Boolean(org.phone?.trim() || pickProfilePhone(org)),
  },
  {
    key: "contactName",
    isFilled: (org) => Boolean(org.contactName?.trim()),
  },
  {
    key: "companyIdentifiers.registrationNumber",
    isFilled: (org) =>
      Boolean(normalizeIdentifiers(org).registrationNumber?.trim() || pickProfileRegistration(org)),
  },
  {
    key: "companyIdentifiers.vatNumber",
    isFilled: (org) => Boolean(normalizeIdentifiers(org).vatId?.trim() || pickProfileVat(org)),
  },
];

const FIELD_LABEL_KEYS: Record<string, string> = {
  legalName: "settings.companyProfile.legalName",
  billingEmail: "settings.companyProfile.email",
  countryCode: "settings.companyProfile.country",
  "billingAddress.street": "settings.companyProfile.address",
  "billingAddress.city": "settings.companyProfile.city",
  phone: "settings.companyProfile.phone",
  contactName: "settings.companyProfile.contactName",
  "companyIdentifiers.registrationNumber": "settings.companyProfile.registrationNumber",
  "companyIdentifiers.vatNumber": "settings.companyProfile.vatId",
};

export function getCompanyProfileFieldLabelKey(fieldKey: string): string {
  return FIELD_LABEL_KEYS[fieldKey] ?? fieldKey;
}

function pickProfileEmail(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  const email = profile.email ?? profile.contactEmail;
  return typeof email === "string" ? email.trim() : "";
}

function pickProfileCountry(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  const country = profile.countryCode ?? profile.country;
  return typeof country === "string" ? country.trim() : "";
}

function pickProfileAddress(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  const address = profile.addressText ?? profile.address ?? profile.street;
  return typeof address === "string" ? address.trim() : "";
}

function pickProfileCity(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  return typeof profile.city === "string" ? profile.city.trim() : "";
}

function pickProfileZip(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  const zip = profile.zip ?? profile.postalCode;
  return typeof zip === "string" ? zip.trim() : "";
}

function pickProfilePhone(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  const phone = profile.phone ?? profile.contactPhone;
  return typeof phone === "string" ? phone.trim() : "";
}

function pickProfileRegistration(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  const reg = profile.registrationNumber ?? profile.ico;
  return typeof reg === "string" ? reg.trim() : "";
}

function pickProfileVat(org: CanonicalOrganizationRecord): string {
  const profile = org.profile;
  if (!profile || typeof profile !== "object") return "";
  const vat = profile.vatId ?? profile.vatNumber ?? profile.icDph;
  return typeof vat === "string" ? vat.trim() : "";
}

export function normalizeBillingAddress(
  org: CanonicalOrganizationRecord
): OrganizationBillingAddress {
  const raw = org.billingAddress;
  if (!raw || typeof raw !== "object") return {};
  const line1Raw =
    typeof raw.line1 === "string"
      ? raw.line1
      : typeof raw.street === "string"
        ? raw.street
        : undefined;
  const zipRaw =
    typeof raw.zip === "string" ? raw.zip : typeof raw.postalCode === "string" ? raw.postalCode : undefined;
  return {
    line1: line1Raw?.trim() || undefined,
    line2: typeof raw.line2 === "string" ? raw.line2.trim() : raw.line2 === null ? null : undefined,
    city: typeof raw.city === "string" ? raw.city.trim() : undefined,
    zip: zipRaw?.trim() || undefined,
    country: typeof raw.country === "string" ? raw.country.trim() : undefined,
  };
}

export function normalizeIdentifiers(
  org: CanonicalOrganizationRecord
): OrganizationCompanyIdentifiers {
  const raw = org.companyIdentifiers;
  if (!raw || typeof raw !== "object") return {};
  const vatRaw =
    typeof raw.vatId === "string"
      ? raw.vatId
      : typeof raw.vatNumber === "string"
        ? raw.vatNumber
        : null;
  return {
    registrationNumber:
      typeof raw.registrationNumber === "string"
        ? raw.registrationNumber.trim()
        : raw.registrationNumber ?? null,
    taxId: typeof raw.taxId === "string" ? raw.taxId.trim() : raw.taxId ?? null,
    vatId: typeof vatRaw === "string" ? vatRaw.trim() : vatRaw ?? null,
  };
}

export function getCompanyProfileCompletion(
  org: CanonicalOrganizationRecord | null | undefined
): CompanyProfileCompletion {
  if (!org) {
    return {
      isComplete: false,
      missingFields: RECOMMENDED_FIELDS.map((f) => f.key),
      missingRecommendedFields: RECOMMENDED_FIELDS.map((f) => f.key),
      missingOptionalFields: OPTIONAL_FIELDS.map((f) => f.key),
      completionPercent: 0,
    };
  }

  const missingRecommendedFields = RECOMMENDED_FIELDS.filter((field) => !field.isFilled(org)).map(
    (field) => field.key
  );
  const missingOptionalFields = OPTIONAL_FIELDS.filter((field) => !field.isFilled(org)).map(
    (field) => field.key
  );
  const allFields = [...RECOMMENDED_FIELDS, ...OPTIONAL_FIELDS];
  const missingFields = allFields.filter((field) => !field.isFilled(org)).map((field) => field.key);
  const filledCount = allFields.length - missingFields.length;
  const completionPercent = Math.round((filledCount / allFields.length) * 100);

  return {
    isComplete: missingRecommendedFields.length === 0,
    missingFields,
    missingRecommendedFields,
    missingOptionalFields,
    completionPercent,
  };
}

export function isValidBusinessOrganization(org: CanonicalOrganizationRecord | null | undefined): boolean {
  if (!org?.ownerUid?.trim()) return false;
  if (org.businessEnabled !== true) return false;
  const status = (org.status ?? "").toLowerCase();
  return status === "trialing" || status === "active" || status === "pending_payment";
}

export function mergeOrganizationIntoProfile(
  data: Record<string, unknown>
): import("./organizationProfile").OrganizationProfile {
  const org = data as CanonicalOrganizationRecord;
  const profileRaw =
    data.profile && typeof data.profile === "object"
      ? (data.profile as Record<string, unknown>)
      : {};
  const billing = normalizeBillingAddress(org);
  const ids = normalizeIdentifiers(org);

  return {
    legalName:
      (typeof org.legalName === "string" ? org.legalName : undefined) ??
      (typeof profileRaw.legalName === "string" ? profileRaw.legalName : undefined) ??
      (typeof org.name === "string" ? org.name : undefined),
    addressText:
      billing.line1 ??
      (typeof profileRaw.addressText === "string" ? profileRaw.addressText : undefined),
    city: billing.city ?? (typeof profileRaw.city === "string" ? profileRaw.city : undefined),
    zip: billing.zip ?? (typeof profileRaw.zip === "string" ? profileRaw.zip : undefined),
    country:
      org.countryCode ??
      org.country ??
      billing.country ??
      (typeof profileRaw.country === "string" ? profileRaw.country : undefined),
    registrationNumber:
      ids.registrationNumber ??
      (typeof profileRaw.registrationNumber === "string" ? profileRaw.registrationNumber : undefined),
    taxId:
      ids.taxId ?? (typeof profileRaw.taxId === "string" ? profileRaw.taxId : undefined),
    vatId:
      ids.vatId ?? (typeof profileRaw.vatId === "string" ? profileRaw.vatId : undefined),
    phone:
      (typeof org.phone === "string" ? org.phone : undefined) ??
      (typeof profileRaw.phone === "string" ? profileRaw.phone : undefined),
    email:
      org.billingEmail ?? (typeof profileRaw.email === "string" ? profileRaw.email : undefined),
    contactName:
      (typeof org.contactName === "string" ? org.contactName : undefined) ??
      (typeof profileRaw.contactName === "string" ? profileRaw.contactName : undefined),
    websiteUrl: typeof profileRaw.websiteUrl === "string" ? profileRaw.websiteUrl : undefined,
    bankAccount: typeof profileRaw.bankAccount === "string" ? profileRaw.bankAccount : undefined,
    logoUrl: typeof profileRaw.logoUrl === "string" ? profileRaw.logoUrl : undefined,
    logoStoragePath:
      typeof profileRaw.logoStoragePath === "string" ? profileRaw.logoStoragePath : undefined,
    paymentQrUrl:
      typeof profileRaw.paymentQrUrl === "string" ? profileRaw.paymentQrUrl : undefined,
    paymentQrStoragePath:
      typeof profileRaw.paymentQrStoragePath === "string"
        ? profileRaw.paymentQrStoragePath
        : undefined,
  };
}
