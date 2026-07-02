import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  verifyApiAuth,
  guardOrgOwnerOrAdmin,
  requireAdminConfigured,
  AdminUnavailableError,
} from "@/lib/apiAuth";
import { getAdminDb, getAdminStorage } from "@/lib/firebaseAdmin";
import { mergeOrganizationIntoProfile } from "@/lib/companyProfileCompletion";
import { organizationProfileToFirestore } from "@/lib/organizationProfile";

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

export async function POST(request: NextRequest) {
  if (!requireAdminConfigured()) {
    return NextResponse.json({ errorCode: "ADMIN_UNAVAILABLE" }, { status: 503 });
  }

  const auth = await verifyApiAuth(request);
  if (!auth) {
    return NextResponse.json({ errorCode: "UNAUTHORIZED" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ errorCode: "INVALID_FORM" }, { status: 400 });
  }

  const orgId = String(form.get("orgId") ?? "").trim();
  const file = form.get("file");
  if (!orgId) {
    return NextResponse.json({ errorCode: "ORG_REQUIRED" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ errorCode: "FILE_REQUIRED" }, { status: 400 });
  }

  const mimeType = resolveLogoMimeType(file);
  if (!mimeType || !LOGO_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ errorCode: "UNSUPPORTED_TYPE" }, { status: 400 });
  }
  if (file.size > LOGO_MAX_BYTES) {
    return NextResponse.json({ errorCode: "TOO_LARGE" }, { status: 400 });
  }

  const guard = await guardOrgOwnerOrAdmin(orgId, auth.uid, auth.email);
  if (guard) return guard;

  try {
    const storage = getAdminStorage();
    const db = getAdminDb();
    if (!storage || !db) {
      return NextResponse.json({ errorCode: "ADMIN_UNAVAILABLE" }, { status: 503 });
    }

    const ext = extensionForMime(mimeType);
    const storagePath = `organizations/${orgId}/profile/logo-${Date.now()}.${ext}`;
    const bucket = storage.bucket();
    const buffer = Buffer.from(await file.arrayBuffer());
    const downloadToken = crypto.randomUUID();

    await bucket.file(storagePath).save(buffer, {
      contentType: mimeType,
      metadata: {
        cacheControl: "public,max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    const orgSnap = await db.doc(`organizations/${orgId}`).get();
    const existingProfile = orgSnap.exists
      ? mergeOrganizationIntoProfile(orgSnap.data() as Record<string, unknown>)
      : {};

    await db.doc(`organizations/${orgId}`).set(
      {
        profile: organizationProfileToFirestore({
          ...existingProfile,
          logoUrl,
          logoStoragePath: storagePath,
        }),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, logoUrl, logoStoragePath: storagePath });
  } catch (e) {
    if (e instanceof AdminUnavailableError) {
      return NextResponse.json({ errorCode: "ADMIN_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[organization/logo]", e);
    return NextResponse.json({ errorCode: "UPLOAD_FAILED" }, { status: 500 });
  }
}
