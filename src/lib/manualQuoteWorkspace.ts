/**
 * Phase 1B helpers for the manual quote tab (DraftQuoteItemsPanel).
 * Pure functions — safe to unit-test without React.
 */

import type { MaterialUnit } from "@/services/materials/types";
import { QUOTE_DRAFT_UNITS } from "@/lib/quoteDraftItems";
import type { ProjectDoc } from "@/lib/projects";
import { isDraftJob } from "@/lib/projectLifecycle";
import {
  contactRecommendedForWorkType,
  type WorkType,
} from "@/lib/workTypes";
import { isManualQuoteWorkspaceEnabled } from "@/lib/projectCreationFeature";

const CATALOG_UNIT_TO_QUOTE: Record<string, string> = {
  pcs: "ks",
  m: "m",
  m2: "m²",
  m3: "m³",
  hour: "hod",
  set: "súbor",
  other: "ks",
};

/** Map workspace catalog unit → quote draft unit select values. */
export function catalogUnitToQuoteDraftUnit(unit: MaterialUnit | string): string {
  const mapped = CATALOG_UNIT_TO_QUOTE[unit] ?? unit;
  if ((QUOTE_DRAFT_UNITS as readonly string[]).includes(mapped)) return mapped;
  return "ks";
}

/**
 * Persist plain notes without wiping AI / document JSON stored in quoteDraftNotes.
 */
export function mergeQuoteDraftPlainNotes(
  existing: string | undefined | null,
  plainNotes: string
): string {
  const trimmed = plainNotes.trim();
  if (!existing?.trim()) return trimmed;

  try {
    const parsed = JSON.parse(existing) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.aiSetupMeta != null || parsed.quoteDocumentMeta != null)
    ) {
      const next = { ...parsed };
      if (trimmed) next.plainNotes = trimmed;
      else delete next.plainNotes;
      return JSON.stringify(next);
    }
  } catch {
    /* plain string notes */
  }

  return trimmed;
}

export function projectHasQuoteCustomer(
  project: Pick<
    ProjectDoc,
    "customerId" | "customerName" | "customerCompanyName"
  >
): boolean {
  return Boolean(
    project.customerId?.trim() ||
      project.customerName?.trim() ||
      project.customerCompanyName?.trim()
  );
}

/** Confirm before delete when the line has meaningful qty or price. */
export function shouldConfirmQuoteItemDelete(qty: number, unitPrice: number): boolean {
  return (Number.isFinite(qty) && qty > 0) || (Number.isFinite(unitPrice) && unitPrice > 0);
}

/** Manual editor on the quote tab (sales draft only). */
export function shouldShowManualQuoteEditor(project: ProjectDoc): boolean {
  return isManualQuoteWorkspaceEnabled() && isDraftJob(project);
}

/** Soft, non-blocking tip — never blocks draft editing. */
export function shouldShowQuoteCustomerHint(project: ProjectDoc): boolean {
  if (!shouldShowManualQuoteEditor(project)) return false;
  if (projectHasQuoteCustomer(project)) return false;
  const archetype = (project.jobArchetype ?? project.workType) as WorkType | undefined;
  return contactRecommendedForWorkType(archetype);
}
