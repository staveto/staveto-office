/**
 * Company profile persistence and logo upload for organizations/{orgId}.profile
 */
import {
  getStorageInstance,
  ref,
  uploadBytes,
  getDownloadURL,
} from "@/lib/firebase";
import {
  readOrganizationProfile,
  writeOrganizationProfile,
  type OrganizationProfile,
  type OrganizationProfileInput,
  type OrganizationPrintInfo,
} from "@/lib/organizationProfile";
import { isOrganizationMember } from "./organizationService";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
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

export async function loadCompanyProfile(orgId: string): Promise<OrganizationPrintInfo | null> {
  return readOrganizationProfile(orgId);
}

export async function saveCompanyProfile(
  orgId: string,
  userId: string,
  input: OrganizationProfileInput
): Promise<void> {
  const membership = await isOrganizationMember(orgId, userId);
  if (!membership.member) {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }

  await writeOrganizationProfile(orgId, input);
}

export async function uploadCompanyLogo(
  orgId: string,
  userId: string,
  file: File,
  currentProfile: OrganizationProfile | null
): Promise<{ logoUrl: string; logoStoragePath: string }> {
  const membership = await isOrganizationMember(orgId, userId);
  if (!membership.member) {
    throw new Error("COMPANY_PROFILE_ACCESS_DENIED");
  }

  const mimeType = resolveLogoMimeType(file);
  if (!mimeType || !LOGO_MIME_TYPES.has(mimeType)) {
    throw new Error("COMPANY_PROFILE_LOGO_UNSUPPORTED");
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error("COMPANY_PROFILE_LOGO_TOO_LARGE");
  }

  const storage = getStorageInstance();
  if (!storage) throw new Error("COMPANY_PROFILE_STORAGE_NOT_CONFIGURED");

  const ext = extensionForMime(mimeType);
  const storagePath = `organizations/${orgId}/profile/logo-${Date.now()}.${ext}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mimeType });
  const logoUrl = await getDownloadURL(storageRef);

  await writeOrganizationProfile(orgId, {
    ...(currentProfile ?? {}),
    logoUrl,
    logoStoragePath: storagePath,
  });

  return { logoUrl, logoStoragePath: storagePath };
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

export type { OrganizationProfile, OrganizationProfileInput, OrganizationPrintInfo };
