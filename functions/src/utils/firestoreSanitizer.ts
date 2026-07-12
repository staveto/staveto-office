/**
 * Deep-sanitize values before Firestore writes.
 * Removes `undefined` keys/array elements only — preserves null, 0, false, "".
 * Does not JSON.stringify (keeps Date / FieldValue / Timestamp intact).
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively strip `undefined` from objects and arrays.
 * Non-plain objects (Date, Firestore Timestamp, FieldValue, Buffer, …) are kept as-is.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) {
    // Callers should not pass top-level undefined; treat as empty object for safety.
    return {} as T;
  }
  if (value === null) return value;
  if (Array.isArray(value)) {
    const next = value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item));
    return next as T;
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

export type EvidenceInputType =
  | "pdf"
  | "image"
  | "text"
  | "email"
  | "voice"
  | "unknown";

export type EvidenceSourceInput = {
  fileId?: string | null;
  fileName?: string | null;
  page?: number | null;
  regionLabel?: string | null;
  inputType?: EvidenceInputType | string | null;
};

export type EvidenceSource = {
  inputType: EvidenceInputType;
  fileId?: string;
  fileName?: string;
  page?: number;
  regionLabel?: string;
};

const VALID_INPUT_TYPES = new Set<string>([
  "pdf",
  "image",
  "text",
  "email",
  "voice",
  "unknown",
]);

/**
 * Build an AiEvidenceSource without undefined optional fields (Firestore-safe).
 */
export function createEvidenceSource(input: EvidenceSourceInput): EvidenceSource {
  const rawType =
    typeof input.inputType === "string" && VALID_INPUT_TYPES.has(input.inputType)
      ? (input.inputType as EvidenceInputType)
      : "unknown";

  const evidence: EvidenceSource = {
    inputType: rawType,
  };

  if (typeof input.fileId === "string" && input.fileId.trim()) {
    evidence.fileId = input.fileId.trim();
  }
  if (typeof input.fileName === "string" && input.fileName.trim()) {
    evidence.fileName = input.fileName.trim();
  }
  if (typeof input.page === "number" && Number.isFinite(input.page)) {
    evidence.page = input.page;
  }
  if (typeof input.regionLabel === "string" && input.regionLabel.trim()) {
    evidence.regionLabel = input.regionLabel.trim();
  }

  return evidence;
}

/**
 * Normalize an existing evidence row (from AI JSON) into a Firestore-safe object.
 */
export function normalizeEvidenceSource(
  raw: unknown,
  defaults?: EvidenceSourceInput
): EvidenceSource {
  const row =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return createEvidenceSource({
    fileId:
      (typeof row.fileId === "string" ? row.fileId : undefined) ??
      defaults?.fileId,
    fileName:
      (typeof row.fileName === "string" ? row.fileName : undefined) ??
      defaults?.fileName,
    page:
      (typeof row.page === "number" ? row.page : undefined) ??
      defaults?.page,
    regionLabel:
      (typeof row.regionLabel === "string" ? row.regionLabel : undefined) ??
      defaults?.regionLabel,
    inputType:
      (typeof row.inputType === "string" ? row.inputType : undefined) ??
      defaults?.inputType ??
      "unknown",
  });
}
