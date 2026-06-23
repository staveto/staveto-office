/**
 * Resolve problem photos — same sources as mobile ProblemDetailScreen:
 * Firestore `photos[]`, Storage folder, and image attachments.
 */
import {
  collection,
  getDocs,
  getDownloadURL,
  getFirestoreInstance,
  getStorageInstance,
  listAll,
  ref,
} from "@/lib/firebase";
import type { ProblemPhoto } from "./projectProblemsReadService";

function normalizeStoragePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("gs://")) {
    const slash = trimmed.indexOf("/", 5);
    return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  }
  return trimmed.replace(/^\/+/, "");
}

function photoKey(photo: ProblemPhoto): string {
  return photo.path || photo.downloadURL || "";
}

function dedupePhotos(photos: ProblemPhoto[]): ProblemPhoto[] {
  const seen = new Set<string>();
  const out: ProblemPhoto[] = [];
  for (const p of photos) {
    const key = photoKey(p);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Parse `photos` field — supports objects, plain URL/path strings, legacy shapes. */
export function parseProblemPhotosFromData(data: Record<string, unknown>): ProblemPhoto[] {
  const out: ProblemPhoto[] = [];

  const push = (path: string, downloadURL?: string) => {
    const normalizedPath = normalizeStoragePath(path);
    const url = downloadURL?.trim() || undefined;
    if (normalizedPath || url) {
      out.push({ path: normalizedPath, downloadURL: url });
    }
  };

  const photosRaw = data.photos;
  if (Array.isArray(photosRaw)) {
    for (const item of photosRaw) {
      if (typeof item === "string") {
        if (item.startsWith("http://") || item.startsWith("https://")) {
          push("", item);
        } else {
          push(item);
        }
        continue;
      }
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(
          String(o.path ?? o.storagePath ?? o.fullPath ?? ""),
          typeof o.downloadURL === "string"
            ? o.downloadURL
            : typeof o.downloadUrl === "string"
              ? o.downloadUrl
              : typeof o.url === "string"
                ? o.url
                : undefined
        );
      }
    }
  } else if (photosRaw && typeof photosRaw === "object") {
    const o = photosRaw as Record<string, unknown>;
    push(
      String(o.path ?? o.storagePath ?? ""),
      typeof o.downloadURL === "string" ? o.downloadURL : undefined
    );
  }

  if (typeof data.photoUrl === "string") {
    push(String(data.photoPath ?? ""), data.photoUrl);
  }
  if (typeof data.photoPath === "string" && !out.some((p) => p.path === data.photoPath)) {
    push(String(data.photoPath));
  }

  return dedupePhotos(out);
}

async function listPhotosFromStorageFolder(
  projectId: string,
  problemId: string
): Promise<ProblemPhoto[]> {
  const storage = getStorageInstance();
  if (!storage) return [];

  try {
    const folderRef = ref(storage, `projects/${projectId}/problems/${problemId}`);
    const listing = await listAll(folderRef);
    const photos: ProblemPhoto[] = [];

    for (const item of listing.items) {
      try {
        const downloadURL = await getDownloadURL(item);
        photos.push({ path: item.fullPath, downloadURL });
      } catch {
        photos.push({ path: item.fullPath });
      }
    }

    return photos;
  } catch {
    return [];
  }
}

type AttachmentRow = {
  id: string;
  fileType: string;
  contentType: string;
  storagePath: string;
  downloadURL?: string;
};

async function loadProjectAttachments(projectId: string): Promise<AttachmentRow[]> {
  const db = getFirestoreInstance();
  if (!db) return [];

  try {
    const snap = await getDocs(collection(db, "projects", projectId, "attachments"));
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        fileType: String(data.fileType ?? data.kind ?? ""),
        contentType: String(data.contentType ?? ""),
        storagePath: String(data.storagePath ?? ""),
        downloadURL:
          typeof data.downloadURL === "string"
            ? data.downloadURL
            : typeof data.url === "string"
              ? data.url
              : undefined,
      };
    });
  } catch {
    return [];
  }
}

function isImageAttachment(row: AttachmentRow): boolean {
  const ft = row.fileType.toLowerCase();
  if (ft === "image" || ft === "work_photo") return true;
  return row.contentType.toLowerCase().startsWith("image/");
}

function attachmentsForProblem(
  rows: AttachmentRow[],
  projectId: string,
  problemId: string,
  attachmentIds: string[]
): ProblemPhoto[] {
  const idSet = new Set(attachmentIds.filter(Boolean));
  const prefix = `projects/${projectId}/problems/${problemId}/`;
  const photos: ProblemPhoto[] = [];

  for (const row of rows) {
    if (!isImageAttachment(row)) continue;
    const path = normalizeStoragePath(row.storagePath);
    const linked = idSet.has(row.id) || path.startsWith(prefix);
    if (!linked) continue;
    if (path || row.downloadURL) {
      photos.push({ path, downloadURL: row.downloadURL });
    }
  }

  return photos;
}

/** Load all photo sources for one problem (Firestore + Storage + attachments). */
export async function resolveProblemPhotos(
  projectId: string,
  problemId: string,
  data: Record<string, unknown>,
  cachedAttachments?: AttachmentRow[]
): Promise<ProblemPhoto[]> {
  let photos = parseProblemPhotosFromData(data);

  if (photos.length === 0) {
    photos = await listPhotosFromStorageFolder(projectId, problemId);
  }

  if (photos.length === 0) {
    const attachmentIds = Array.isArray(data.attachments)
      ? (data.attachments as unknown[]).map(String).filter(Boolean)
      : [];
    const rows = cachedAttachments ?? (await loadProjectAttachments(projectId));
    photos = attachmentsForProblem(rows, projectId, problemId, attachmentIds);
  }

  return dedupePhotos(photos);
}

export async function resolvePhotosForProjectProblems(
  projectId: string,
  items: Array<{ id: string; data: Record<string, unknown> }>
): Promise<Map<string, ProblemPhoto[]>> {
  const attachments = await loadProjectAttachments(projectId);
  const result = new Map<string, ProblemPhoto[]>();

  await Promise.all(
    items.map(async ({ id, data }) => {
      const photos = await resolveProblemPhotos(projectId, id, data, attachments);
      result.set(id, photos);
    })
  );

  return result;
}
