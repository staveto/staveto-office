/**
 * Company profile persistence and logo upload for organizations/{orgId}.profile
 */
import {
  getStorageInstance,
  getFirestoreInstance,
  getAuthInstance,
  doc,
  getDoc,
  ref,
  uploadBytes,
  getDownloadURL,
} from "@/lib/firebase";
import {
  readOrganizationProfile,
  writeCompanyProfileSettings,
  patchOrganizationProfileFields,
  type OrganizationProfile,
  type OrganizationProfileInput,
  type OrganizationPrintInfo,
} from "@/lib/organizationProfile";
import { getOrganization } from "@/lib/organizations";
import { isOrganizationMember } from "./organizationService";
import {
  COMPANY_LOGO_MAX_BYTES,
  prepareCompanyLogoFile,
} from "@/lib/prepareCompanyLogoFile";

const LOGO_MAX_BYTES = COMPANY_LOGO_MAX_BYTES;
const LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

function resolveLogoMimeType(file: File): string | null {
  const type = file.type?.trim().toLowerCase();
  if (type && LOGO_MIME_TYPES.has(type)) return type;

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return type || null;
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  return "jpg";
}

function validateCompanyLogoFile(file: File): { mimeType: string; ext: string } {
  const mimeType = resolveLogoMimeType(file);
  if (!mimeType || !LOGO_MIME_TYPES.has(mimeType)) {
    throw new Error("COMPANY_PROFILE_LOGO_UNSUPPORTED");
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error("COMPANY_PROFILE_LOGO_TOO_LARGE");
  }
  return { mimeType, ext: extensionForMime(mimeType) };
}

async function uploadCompanyLogoViaApi(
  orgId: string,
  file: File
): Promise<{ logoUrl: string; logoStoragePath: string }> {
  const auth = getAuthInstance();
  const user = auth?.currentUser;
  if (!user) throw new Error("COMPANY_PROFILE_ACCESS_DENIED");

  const token = await user.getIdToken();
  const form = new FormData();
  form.append("orgId", orgId);
  form.append("file", file, file.name);

  const res = await fetch("/api/organization/logo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as {
    errorCode?: string;
    logoUrl?: string;
    logoStoragePath?: string;
  };

  if (res.status === 503 && data.errorCode === "ADMIN_UNAVAILABLE") {
    throw new Error("COMPANY_PROFILE_API_ADMIN_UNAVAILABLE");
  }
  if (res.status === 403 || data.errorCode === "FORBIDDEN") {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }
  if (data.errorCode === "UNSUPPORTED_TYPE") {
    throw new Error("COMPANY_PROFILE_LOGO_UNSUPPORTED");
  }
  if (data.errorCode === "TOO_LARGE") {
    throw new Error("COMPANY_PROFILE_LOGO_TOO_LARGE");
  }
  if (!res.ok || !data.logoUrl || !data.logoStoragePath) {
    throw new Error("COMPANY_PROFILE_LOGO_UPLOAD_FAILED");
  }

  return { logoUrl: data.logoUrl, logoStoragePath: data.logoStoragePath };
}

async function uploadCompanyLogoClient(
  orgId: string,
  userId: string,
  file: File
): Promise<{ logoUrl: string; logoStoragePath: string }> {
  const { mimeType, ext } = validateCompanyLogoFile(file);

  const storage = getStorageInstance();
  if (!storage) throw new Error("COMPANY_PROFILE_STORAGE_NOT_CONFIGURED");

  const storagePath = `organizations/${orgId}/profile/logo-${Date.now()}.${ext}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mimeType });
  const logoUrl = await getDownloadURL(storageRef);

  await patchOrganizationProfileFields(
    orgId,
    {
      logoUrl,
      logoStoragePath: storagePath,
    },
    userId
  );

  return { logoUrl, logoStoragePath: storagePath };
}

async function uploadCompanyPaymentQrViaApi(
  orgId: string,
  file: File
): Promise<{ paymentQrUrl: string; paymentQrStoragePath: string }> {
  const auth = getAuthInstance();
  const user = auth?.currentUser;
  if (!user) throw new Error("COMPANY_PROFILE_ACCESS_DENIED");

  const token = await user.getIdToken();
  const form = new FormData();
  form.append("orgId", orgId);
  form.append("file", file, file.name);

  const res = await fetch("/api/organization/payment-qr", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const data = (await res.json().catch(() => ({}))) as {
    errorCode?: string;
    paymentQrUrl?: string;
    paymentQrStoragePath?: string;
  };

  if (res.status === 503 && data.errorCode === "ADMIN_UNAVAILABLE") {
    throw new Error("COMPANY_PROFILE_API_ADMIN_UNAVAILABLE");
  }
  if (res.status === 403 || data.errorCode === "FORBIDDEN") {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }
  if (data.errorCode === "UNSUPPORTED_TYPE") {
    throw new Error("COMPANY_PROFILE_LOGO_UNSUPPORTED");
  }
  if (data.errorCode === "TOO_LARGE") {
    throw new Error("COMPANY_PROFILE_LOGO_TOO_LARGE");
  }
  if (!res.ok || !data.paymentQrUrl || !data.paymentQrStoragePath) {
    throw new Error("COMPANY_PROFILE_LOGO_UPLOAD_FAILED");
  }

  return { paymentQrUrl: data.paymentQrUrl, paymentQrStoragePath: data.paymentQrStoragePath };
}

async function uploadCompanyPaymentQrClient(
  orgId: string,
  userId: string,
  file: File
): Promise<{ paymentQrUrl: string; paymentQrStoragePath: string }> {
  const { mimeType, ext } = validateCompanyLogoFile(file);

  const storage = getStorageInstance();
  if (!storage) throw new Error("COMPANY_PROFILE_STORAGE_NOT_CONFIGURED");

  const storagePath = `organizations/${orgId}/profile/payment-qr-${Date.now()}.${ext}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mimeType });
  const paymentQrUrl = await getDownloadURL(storageRef);

  await patchOrganizationProfileFields(
    orgId,
    {
      paymentQrUrl,
      paymentQrStoragePath: storagePath,
    },
    userId
  );

  return { paymentQrUrl, paymentQrStoragePath: storagePath };
}

export async function loadCompanyProfile(orgId: string): Promise<OrganizationPrintInfo | null> {
  return readOrganizationProfile(orgId);
}

export async function canEditCompanyProfile(
  orgId: string,
  uid: string
): Promise<boolean> {
  const org = await getOrganization(orgId);
  if (!org) return false;
  if (org.ownerUid === uid) return true;

  const membership = await isOrganizationMember(orgId, uid);
  if (!membership.member) return false;

  const db = getFirestoreInstance();
  if (db) {
    const memberSnap = await getDoc(doc(db, "organizations", orgId, "members", uid));
    const status = memberSnap.data()?.status as string | undefined;
    if (status && status !== "active") return false;
  }

  const role = String(membership.role ?? "").toLowerCase();
  return role === "admin" || role === "owner";
}

export async function saveCompanyProfile(
  orgId: string,
  userId: string,
  input: OrganizationProfileInput
): Promise<OrganizationPrintInfo | null> {
  if (!(await canEditCompanyProfile(orgId, userId))) {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }

  return writeCompanyProfileSettings(orgId, userId, input);
}

export async function uploadCompanyLogo(
  orgId: string,
  userId: string,
  file: File,
  _currentProfile: OrganizationProfile | null
): Promise<{ logoUrl: string; logoStoragePath: string; optimized: boolean }> {
  if (!(await canEditCompanyProfile(orgId, userId))) {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }

  const { file: preparedFile, optimized } = await prepareCompanyLogoFile(file);
  validateCompanyLogoFile(preparedFile);

  try {
    const result = await uploadCompanyLogoViaApi(orgId, preparedFile);
    return { ...result, optimized };
  } catch (e) {
    if (e instanceof Error && e.message === "COMPANY_PROFILE_API_ADMIN_UNAVAILABLE") {
      const result = await uploadCompanyLogoClient(orgId, userId, preparedFile);
      return { ...result, optimized };
    }
    throw e;
  }
}

export async function removeCompanyLogo(
  orgId: string,
  userId: string,
  currentProfile: OrganizationProfile | null
): Promise<void> {
  await saveCompanyProfile(orgId, userId, {
    ...(currentProfile ?? {}),
    logoUrl: undefined,
    logoStoragePath: undefined,
  });
}

export async function uploadCompanyPaymentQr(
  orgId: string,
  userId: string,
  file: File
): Promise<{ paymentQrUrl: string; paymentQrStoragePath: string; optimized: boolean }> {
  if (!(await canEditCompanyProfile(orgId, userId))) {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }

  const { file: preparedFile, optimized } = await prepareCompanyLogoFile(file);
  validateCompanyLogoFile(preparedFile);

  try {
    const result = await uploadCompanyPaymentQrViaApi(orgId, preparedFile);
    return { ...result, optimized };
  } catch (e) {
    if (e instanceof Error && e.message === "COMPANY_PROFILE_API_ADMIN_UNAVAILABLE") {
      const result = await uploadCompanyPaymentQrClient(orgId, userId, preparedFile);
      return { ...result, optimized };
    }
    throw e;
  }
}

export async function removeCompanyPaymentQr(orgId: string, userId: string): Promise<void> {
  if (!(await canEditCompanyProfile(orgId, userId))) {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }

  await patchOrganizationProfileFields(
    orgId,
    {
      paymentQrUrl: undefined,
      paymentQrStoragePath: undefined,
    },
    userId
  );
}

export type { OrganizationProfile, OrganizationProfileInput, OrganizationPrintInfo };
