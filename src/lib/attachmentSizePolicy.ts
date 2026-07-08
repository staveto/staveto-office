/**
 * Attachment size policy — Firebase Storage holds bytes; Firestore only metadata.
 *
 * Goals: sharp enough for site photos / quote PDFs on phone & desktop,
 * without 10+ MB uploads blocking import or inflating storage bills.
 */
export const ATTACHMENT_SIZE_POLICY = {
  /** Hard reject above this (matches storage.rules). */
  maxUploadBytes: 25 * 1024 * 1024,

  /** Target after image optimization — typical construction photo. */
  image: {
    maxEdgePx: 1600,
    jpegQuality: 0.82,
    /** Skip re-encode when already small enough. */
    skipBelowBytes: 350_000,
    /** Soft warning in UI when still above this after compress. */
    warnAboveBytes: 2 * 1024 * 1024,
  },

  /**
   * PDFs (plans, quotes) — keep text readable; compress server-side later.
   * For now: accept up to maxUploadBytes, warn above soft target.
   */
  pdf: {
    warnAboveBytes: 5 * 1024 * 1024,
    /** Future: server re-save target after ghostscript/pdf-lib pass. */
    targetMaxBytes: 3 * 1024 * 1024,
  },

  /** Plain text / DOCX — rarely huge; limit only. */
  document: {
    warnAboveBytes: 2 * 1024 * 1024,
  },

  /** Wizard draft folders — safe to purge after project confirm (future lifecycle). */
  aiDraftRetentionDays: 30,
} as const;

export type PreparedAttachment = {
  file: File;
  optimized: boolean;
  warnLarge?: "image" | "pdf" | "document";
};
