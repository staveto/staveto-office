/**
 * Feature flags for simplified project creation (Phase 1A).
 *
 * Defaults (dev + prod unless overridden):
 * - simplified project creation: ON  (`NEXT_PUBLIC_ENABLE_SIMPLIFIED_PROJECT_CREATION=0` to rollback)
 * - AI project creation: OFF         (`NEXT_PUBLIC_ENABLE_AI_PROJECT_CREATION=1` to re-enable)
 * - legacy job-type settings UI: OFF (`NEXT_PUBLIC_ENABLE_LEGACY_PROJECT_TYPE_SETTINGS=1` to show)
 *
 * Opening historical projects with `?setup=ai` is NOT gated here — only the
 * new-project wizard AI path.
 */

import type { WorkType } from "@/lib/workTypes";

/** Legacy Firestore archetype stored on new simplified creates — not used for UI modules. */
export const SIMPLIFIED_LEGACY_WORK_TYPE: WorkType = "customer_job";

export function isSimplifiedProjectCreationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SIMPLIFIED_PROJECT_CREATION !== "0";
}

/**
 * Whether the new-job wizard may offer / call AI project creation.
 * Does not block opening existing AI-setup projects via `?setup=ai`.
 */
export function isAiProjectCreationEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_FORCE_DISABLE_AI_FEATURES === "1") return false;
  if (process.env.NEXT_PUBLIC_DISABLE_AI_GENERATION === "1") return false;
  return process.env.NEXT_PUBLIC_ENABLE_AI_PROJECT_CREATION === "1";
}

/** Company settings panel for enabling/hiding job archetypes in the legacy wizard. */
export function isLegacyProjectTypeSettingsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_LEGACY_PROJECT_TYPE_SETTINGS === "1";
}

/**
 * Phase 1B — manual quote editor on project `?tab=quote` (DraftQuoteItemsPanel).
 * Default ON; set `NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE=0` to rollback.
 */
export function isManualQuoteWorkspaceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_MANUAL_QUOTE_WORKSPACE !== "0";
}

/** Post-create / post-copy landing when manual quote workspace is on. */
export function projectQuoteTabHref(projectId: string): string {
  return `/app/projects/${projectId}?tab=quote`;
}

/**
 * Landing after simplified create/copy.
 * When manual quote workspace is off, fall back to project detail (Phase 1A).
 */
export function projectCreateLandingHref(projectId: string): string {
  if (isManualQuoteWorkspaceEnabled()) return projectQuoteTabHref(projectId);
  return `/app/projects/${projectId}`;
}
