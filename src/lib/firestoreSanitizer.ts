/**
 * Deep-sanitize values before Firestore writes (client-side).
 * Removes `undefined` only — preserves null, 0, false, "".
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) return {} as T;
  if (value === null) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[key] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return value;
}

export type AiEvidenceInputType =
  | "pdf"
  | "image"
  | "text"
  | "email"
  | "voice"
  | "unknown";

export type CreateEvidenceSourceInput = {
  fileId?: string | null;
  fileName?: string | null;
  page?: number | null;
  regionLabel?: string | null;
  inputType?: AiEvidenceInputType | string | null;
};

export function createEvidenceSource(input: CreateEvidenceSourceInput): {
  inputType: AiEvidenceInputType;
  fileId?: string;
  fileName?: string;
  page?: number;
  regionLabel?: string;
} {
  const valid = new Set(["pdf", "image", "text", "email", "voice", "unknown"]);
  const inputType =
    typeof input.inputType === "string" && valid.has(input.inputType)
      ? (input.inputType as AiEvidenceInputType)
      : "unknown";

  return {
    inputType,
    ...(typeof input.fileId === "string" && input.fileId.trim()
      ? { fileId: input.fileId.trim() }
      : {}),
    ...(typeof input.fileName === "string" && input.fileName.trim()
      ? { fileName: input.fileName.trim() }
      : {}),
    ...(typeof input.page === "number" && Number.isFinite(input.page)
      ? { page: input.page }
      : {}),
    ...(typeof input.regionLabel === "string" && input.regionLabel.trim()
      ? { regionLabel: input.regionLabel.trim() }
      : {}),
  };
}
